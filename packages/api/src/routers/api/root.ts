import type { InstallationApiResponse } from '@hyperdx/common-utils/dist/types';
import express from 'express';
import { serializeError } from 'serialize-error';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import * as config from '@/config';
import {
  generateAlertSilenceToken,
  silenceAlertByToken,
} from '@/controllers/alerts';
import { createTeam, getFirstTeam, isTeamExisting } from '@/controllers/team';
import { findUserByEmail } from '@/controllers/user';
import { handleAuthError, redirectToDashboard } from '@/middleware/auth';
import TeamInvite from '@/models/teamInvite';
import User from '@/models/user'; // TODO -> do not import model directly
import { setupTeamDefaults } from '@/setupDefaults';
import {
  generateEntraNonce,
  generateEntraState,
  getEntraAuthorizationUrl,
  handleEntraCallback,
} from '@/utils/entra';
import logger from '@/utils/logger';
import passport from '@/utils/passport';
import { validatePassword } from '@/utils/validators';

const registrationSchema = z
  .object({
    email: z.string().email(),
    password: z
      .string()
      .min(12, 'Password must have at least 12 characters')
      .refine(
        pass => /[a-z]/.test(pass) && /[A-Z]/.test(pass),
        'Password must include both lower and upper case characters',
      )
      .refine(
        pass => /\d/.test(pass),
        'Password must include at least one number',
      )
      .refine(
        pass => /[!@#$%^&*(),.?":{}|<>;\-+=]/.test(pass),
        'Password must include at least one special character',
      ),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

const router = express.Router();

router.get('/health', async (req, res) => {
  res.send({
    data: 'OK',
    version: config.CODE_VERSION,
    ip: req.ip,
    env: config.NODE_ENV,
  });
});

type InstallationEspRes = express.Response<InstallationApiResponse>;
router.get('/installation', async (_, res: InstallationEspRes, next) => {
  try {
    const _isTeamExisting = await isTeamExisting();
    return res.json({
      isTeamExisting: _isTeamExisting,
      isEntraEnabled: config.IS_ENTRA_ENABLED,
    });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/login/password',
  passport.authenticate('local', {
    failWithError: true,
    failureMessage: true,
  }),
  redirectToDashboard,
  handleAuthError,
);

router.post(
  '/register/password',
  validateRequest({ body: registrationSchema }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      if (await isTeamExisting()) {
        return res.status(409).json({ error: 'teamAlreadyExists' });
      }

      (User as any).register(
        new User({ email }),
        password,
        async (err: Error, user: any) => {
          if (err) {
            logger.error(
              { err: serializeError(err) },
              'User registration error',
            );
            return res.status(400).json({ error: 'invalid' });
          }

          const team = await createTeam({
            name: `${email}'s Team`,
            collectorAuthenticationEnforced: true,
          });
          user.team = team._id;
          user.name = email;
          user.role = 'owner';
          await user.save();

          // Set up default connections and sources for this new team
          try {
            await setupTeamDefaults(team._id.toString());
          } catch (error) {
            logger.error(
              { err: serializeError(error) },
              'Failed to setup team defaults',
            );
            // Continue with registration even if setup defaults fails
          }

          return passport.authenticate('local')(req, res, () => {
            if (req?.user?.team) {
              return res.status(200).json({ status: 'success' });
            }

            logger.error(
              { userId: req?.user?._id },
              'Password login for user failed, user or team not found',
            );
            return res.status(400).json({ error: 'invalid' });
          });
        },
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get('/logout', (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect(`${config.FRONTEND_URL}/login`);
  });
});

// TODO: rename this ?
router.post('/team/setup/:token', async (req, res, next) => {
  try {
    const { password } = req.body;
    const { token } = req.params;

    if (!validatePassword(password)) {
      return res.redirect(
        `${config.FRONTEND_URL}/join-team?err=invalid&token=${token}`,
      );
    }

    const teamInvite = await TeamInvite.findOne({
      token: req.params.token,
    });
    if (!teamInvite) {
      return res.status(401).send('Invalid token');
    }

    (User as any).register(
      new User({
        email: teamInvite.email,
        name: teamInvite.email,
        team: teamInvite.teamId,
        role: teamInvite.role ?? 'member',
      }),
      password, // TODO: validate password
      async (err: Error, user: any) => {
        if (err) {
          logger.error({ err: serializeError(err) }, 'Team setup error');
          return res.redirect(
            `${config.FRONTEND_URL}/join-team?token=${token}&err=500`,
          );
        }

        await TeamInvite.findByIdAndRemove(teamInvite._id);

        req.login(user, err => {
          if (err) {
            return next(err);
          }
          redirectToDashboard(req, res);
        });
      },
    );
  } catch (e) {
    next(e);
  }
});

// ─── Entra ID (Microsoft Azure AD) SSO ───────────────────────────────────────

router.get('/login/entra', async (req, res, next) => {
  try {
    if (!config.IS_ENTRA_ENABLED) {
      return res.status(404).json({ error: 'Entra SSO is not configured' });
    }

    const state = generateEntraState();
    const nonce = generateEntraNonce();

    req.session.entraState = state;
    req.session.entraNonce = nonce;

    const authUrl = await getEntraAuthorizationUrl(state, nonce);
    res.redirect(authUrl);
  } catch (e) {
    next(e);
  }
});

router.get('/auth/callback/entra', async (req, res, next) => {
  try {
    if (!config.IS_ENTRA_ENABLED) {
      return res.status(404).json({ error: 'Entra SSO is not configured' });
    }

    const storedState = req.session.entraState;
    const storedNonce = req.session.entraNonce;

    if (!storedState || !storedNonce) {
      logger.warn('Entra callback received without state/nonce in session');
      return res.redirect(
        `${config.FRONTEND_URL}/login?err=entraMissingSession`,
      );
    }

    // Clear session values before callback validation to prevent replay
    delete req.session.entraState;
    delete req.session.entraNonce;

    const currentUrl = `${config.ENTRA_REDIRECT_URI.replace(/\/[^/]*$/, '')}${req.originalUrl}`;

    const userInfo = await handleEntraCallback(
      currentUrl,
      storedState,
      storedNonce,
    );

    // Find or provision the user
    let user = await findUserByEmail(userInfo.email);

    if (!user) {
      // Auto-provision: create user in the existing team (or create team on first login)
      const teamExists = await isTeamExisting();

      let teamId: import('mongoose').Types.ObjectId;
      if (!teamExists) {
        const team = await createTeam({
          name: `${userInfo.email}'s Team`,
          collectorAuthenticationEnforced: true,
        });

        try {
          await setupTeamDefaults(team._id.toString());
        } catch (error) {
          logger.error(
            { err: serializeError(error) },
            'Failed to setup team defaults for Entra user',
          );
        }

        teamId = team._id;
      } else {
        const team = await getFirstTeam();
        if (!team) {
          logger.error('No team found during Entra user provisioning');
          return res.redirect(`${config.FRONTEND_URL}/login?err=entraNoTeam`);
        }
        teamId = team._id;
      }

      // Create the user without a password (Entra-only auth)
      // First Entra user gets owner; subsequent users get member
      const isFirstUser = !(await isTeamExisting());
      user = new User({
        email: userInfo.email,
        name: userInfo.name,
        team: teamId,
        role: isFirstUser ? 'owner' : 'member',
      });
      await user.save();

      logger.info(
        { email: userInfo.email },
        'Provisioned new user via Entra ID SSO',
      );
    }

    req.login(user, err => {
      if (err) {
        return next(err);
      }
      redirectToDashboard(req, res);
    });
  } catch (e) {
    logger.error({ err: serializeError(e) }, 'Entra SSO callback failed');
    res.redirect(`${config.FRONTEND_URL}/login?err=entraFailed`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

router.get('/ext/silence-alert/:token', async (req, res) => {
  let isError = false;

  try {
    const token = req.params.token;
    await silenceAlertByToken(token);
  } catch (e) {
    isError = true;
    logger.error({ err: e }, 'Failed to silence alert');
  }

  // TODO: Create a template for utility pages
  return res.send(`
  <html>
    <head>
      <title>HyperDX</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css" />
    </head>
    <body>
      <header>
        <img src="https://www.hyperdx.io/Icon32.png" />
      </header>
      <main>
        ${
          isError
            ? '<p><strong>Link is invalid or expired.</strong> Please try again.</p>'
            : '<p><strong>Alert silenced.</strong> You can close this window now.</p>'
        }
        <a href="${config.FRONTEND_URL}">Back to HyperDX</a>
      </main>
    </body>
  </html>`);
});

export default router;

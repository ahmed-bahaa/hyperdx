import express from 'express';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import {
  addProjectMember,
  createProject,
  deleteProject,
  getProject,
  getProjects,
  removeProjectMember,
  updateProject,
  updateProjectMemberRole,
} from '@/controllers/project';
import { getNonNullUserWithTeam, requireRole } from '@/middleware/auth';
import { objectIdSchema } from '@/utils/zod';

const router = express.Router();

// List all projects for the team
router.get('/', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);
    const projects = await getProjects(teamId);
    res.json({ data: projects.map(p => p.toJSON()) });
  } catch (e) {
    next(e);
  }
});

// Create a project (admin+)
router.post(
  '/',
  requireRole('admin'),
  validateRequest({
    body: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId, userId } = getNonNullUserWithTeam(req);
      const project = await createProject(
        teamId,
        userId,
        req.body.name,
        req.body.description,
      );
      res.status(201).json(project.toJSON());
    } catch (e) {
      next(e);
    }
  },
);

// Get a single project
router.get(
  '/:id',
  validateRequest({ params: z.object({ id: objectIdSchema }) }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const project = await getProject(req.params.id, teamId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project.toJSON());
    } catch (e) {
      next(e);
    }
  },
);

// Update a project (project admin or team admin+)
router.patch(
  '/:id',
  validateRequest({
    params: z.object({ id: objectIdSchema }),
    body: z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const project = await updateProject(req.params.id, teamId, req.body);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project.toJSON());
    } catch (e) {
      next(e);
    }
  },
);

// Delete a project (team admin+)
router.delete(
  '/:id',
  requireRole('admin'),
  validateRequest({ params: z.object({ id: objectIdSchema }) }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const deleted = await deleteProject(req.params.id, teamId);
      if (!deleted) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json({ message: 'Project deleted' });
    } catch (e) {
      next(e);
    }
  },
);

// Add a member to a project
router.post(
  '/:id/members',
  validateRequest({
    params: z.object({ id: objectIdSchema }),
    body: z.object({
      userId: objectIdSchema,
      role: z.enum(['admin', 'editor', 'viewer']),
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const project = await addProjectMember(
        req.params.id,
        teamId,
        req.body.userId,
        req.body.role,
      );
      if (!project) {
        return res
          .status(400)
          .json({ error: 'Project not found or user already a member' });
      }
      res.json(project.toJSON());
    } catch (e) {
      next(e);
    }
  },
);

// Update a member's project role
router.patch(
  '/:id/members/:userId',
  validateRequest({
    params: z.object({ id: objectIdSchema, userId: objectIdSchema }),
    body: z.object({ role: z.enum(['admin', 'editor', 'viewer']) }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const project = await updateProjectMemberRole(
        req.params.id,
        teamId,
        req.params.userId,
        req.body.role,
      );
      if (!project) {
        return res.status(404).json({ error: 'Project or member not found' });
      }
      res.json(project.toJSON());
    } catch (e) {
      next(e);
    }
  },
);

// Remove a member from a project
router.delete(
  '/:id/members/:userId',
  validateRequest({
    params: z.object({ id: objectIdSchema, userId: objectIdSchema }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const project = await removeProjectMember(
        req.params.id,
        teamId,
        req.params.userId,
      );
      if (!project) {
        return res.status(404).json({ error: 'Project or member not found' });
      }
      res.json(project.toJSON());
    } catch (e) {
      next(e);
    }
  },
);

export default router;

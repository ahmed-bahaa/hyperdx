import { useState } from 'react';
import { Box, Card, Divider, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';

import api from '../../api';

export default function SecurityPoliciesSection({
  allowedAuthMethods,
  isEntraConfigured,
}: {
  allowedAuthMethods: string[];
  isEntraConfigured: boolean;
}) {
  const updateAuthMethods = api.useUpdateAllowedAuthMethods();
  const { refetch: refetchTeam } = api.useTeam();

  const [entraEnabled, setEntraEnabled] = useState(
    allowedAuthMethods.includes('entra'),
  );
  const [passwordEnabled, setPasswordEnabled] = useState(
    allowedAuthMethods.length === 0 || allowedAuthMethods.includes('password'),
  );

  function buildMethods(password: boolean, entra: boolean): string[] {
    const methods: string[] = [];
    if (password) methods.push('password');
    if (entra) methods.push('entra');
    // Always keep at least one method active
    if (methods.length === 0) methods.push('password');
    return methods;
  }

  function handleToggle(method: 'password' | 'entra', checked: boolean) {
    const nextPassword = method === 'password' ? checked : passwordEnabled;
    const nextEntra = method === 'entra' ? checked : entraEnabled;

    const methods = buildMethods(nextPassword, nextEntra);

    updateAuthMethods.mutate(
      { allowedAuthMethods: methods },
      {
        onSuccess: () => {
          if (method === 'password') setPasswordEnabled(checked);
          if (method === 'entra') setEntraEnabled(checked);
          refetchTeam();
          notifications.show({
            color: 'green',
            message: 'Authentication settings updated',
          });
        },
        onError: () => {
          notifications.show({
            color: 'red',
            message: 'Failed to update authentication settings',
          });
        },
      },
    );
  }

  return (
    <Box id="security-policies">
      <Text size="md">Security Policies</Text>
      <Divider my="md" />
      <Card>
        <Stack gap="md">
          <Text size="sm" fw={500}>
            Allowed Authentication Methods
          </Text>
          <Switch
            label="Password"
            description="Team members can log in with email and password"
            checked={passwordEnabled}
            disabled={updateAuthMethods.isPending}
            onChange={e => handleToggle('password', e.currentTarget.checked)}
          />
          <Switch
            label="Microsoft Entra ID (SSO)"
            description={
              isEntraConfigured
                ? 'Team members can log in via Microsoft Entra ID'
                : 'Entra ID is not configured on this instance (set ENTRA_* env vars)'
            }
            checked={entraEnabled}
            disabled={!isEntraConfigured || updateAuthMethods.isPending}
            onChange={e => handleToggle('entra', e.currentTarget.checked)}
          />
        </Stack>
      </Card>
    </Box>
  );
}

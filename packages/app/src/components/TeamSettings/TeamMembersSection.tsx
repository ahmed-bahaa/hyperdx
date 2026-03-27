import { useState } from 'react';
import { HTTPError } from 'ky';
import CopyToClipboard from 'react-copy-to-clipboard';
import {
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLock, IconUserPlus } from '@tabler/icons-react';

import api from '@/api';
import { useBrandDisplayName } from '@/theme/ThemeProvider';

const ROLE_COLORS: Record<string, string> = {
  owner: 'violet',
  admin: 'blue',
  member: 'green',
  viewer: 'gray',
};

export default function TeamMembersSection() {
  const brandName = useBrandDisplayName();
  const { data: me } = api.useMe();
  const myRole = me?.role ?? 'member';
  const hasAdminAccess = myRole === 'owner' || myRole === 'admin';

  const {
    data: members,
    isLoading: isLoadingMembers,
    refetch: refetchMembers,
  } = api.useTeamMembers();

  const {
    data: invitations,
    isLoading: isLoadingInvitations,
    refetch: refetchInvitations,
  } = api.useTeamInvitations();

  const updateMemberRole = api.useUpdateMemberRole();

  const onSubmitTeamInviteForm = ({
    email,
    role,
  }: {
    email: string;
    role: 'admin' | 'member' | 'viewer';
  }) => {
    sendTeamInviteAction(email, role);
    setTeamInviteModalShow(false);
  };

  const [
    deleteTeamMemberConfirmationModalData,
    setDeleteTeamMemberConfirmationModalData,
  ] = useState<{
    mode: 'team' | 'teamInvite' | null;
    id: string | null;
    email: string | null;
  }>({
    mode: null,
    id: null,
    email: null,
  });
  const [teamInviteModalShow, setTeamInviteModalShow] = useState(false);

  const saveTeamInvitation = api.useSaveTeamInvitation();
  const deleteTeamMember = api.useDeleteTeamMember();
  const deleteTeamInvitation = api.useDeleteTeamInvitation();

  const sendTeamInviteAction = (
    email: string,
    role: 'admin' | 'member' | 'viewer',
  ) => {
    if (email) {
      saveTeamInvitation.mutate(
        { email, role },
        {
          onSuccess: () => {
            notifications.show({
              color: 'green',
              message:
                'Click "Copy URL" and share the URL with your team member',
            });
            refetchInvitations();
          },
          onError: e => {
            if (e instanceof HTTPError) {
              e.response
                .json()
                .then(res => {
                  notifications.show({
                    color: 'red',
                    message: res.message,
                    autoClose: 5000,
                  });
                })
                .catch(() => {
                  notifications.show({
                    color: 'red',
                    message: `Something went wrong. Please contact ${brandName} team.`,
                    autoClose: 5000,
                  });
                });
            } else {
              notifications.show({
                color: 'red',
                message: `Something went wrong. Please contact ${brandName} team.`,
                autoClose: 5000,
              });
            }
          },
        },
      );
    }
  };

  const onConfirmDeleteTeamMember = (id: string) => {
    if (deleteTeamMemberConfirmationModalData.mode === 'team') {
      deleteTeamMemberAction(id);
    } else if (deleteTeamMemberConfirmationModalData.mode === 'teamInvite') {
      deleteTeamInviteAction(id);
    }
    setDeleteTeamMemberConfirmationModalData({
      mode: null,
      id: null,
      email: null,
    });
  };

  const deleteTeamInviteAction = (id: string) => {
    if (id) {
      deleteTeamInvitation.mutate(
        { id: encodeURIComponent(id) },
        {
          onSuccess: () => {
            notifications.show({
              color: 'green',
              message: 'Deleted team invite',
            });
            refetchInvitations();
          },
          onError: e => {
            if (e instanceof HTTPError) {
              e.response
                .json()
                .then(res => {
                  notifications.show({
                    color: 'red',
                    message: res.message,
                    autoClose: 5000,
                  });
                })
                .catch(() => {
                  notifications.show({
                    color: 'red',
                    message: `Something went wrong. Please contact ${brandName} team.`,
                    autoClose: 5000,
                  });
                });
            } else {
              notifications.show({
                color: 'red',
                message: `Something went wrong. Please contact ${brandName} team.`,
                autoClose: 5000,
              });
            }
          },
        },
      );
    }
  };

  const deleteTeamMemberAction = (id: string) => {
    if (id) {
      deleteTeamMember.mutate(
        { userId: encodeURIComponent(id) },
        {
          onSuccess: () => {
            notifications.show({
              color: 'green',
              message: 'Deleted team member',
            });
            refetchMembers();
          },
          onError: e => {
            if (e instanceof HTTPError) {
              e.response
                .json()
                .then(res => {
                  notifications.show({
                    color: 'red',
                    message: res.message,
                    autoClose: 5000,
                  });
                })
                .catch(() => {
                  notifications.show({
                    color: 'red',
                    message: `Something went wrong. Please contact ${brandName} team.`,
                    autoClose: 5000,
                  });
                });
            } else {
              notifications.show({
                color: 'red',
                message: `Something went wrong. Please contact ${brandName} team.`,
                autoClose: 5000,
              });
            }
          },
        },
      );
    }
  };

  const handleRoleChange = (
    userId: string,
    role: 'admin' | 'member' | 'viewer',
  ) => {
    updateMemberRole.mutate(
      { userId, role },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: 'Role updated' });
          refetchMembers();
        },
        onError: () => {
          notifications.show({
            color: 'red',
            message: 'Failed to update role',
          });
        },
      },
    );
  };

  return (
    <Box id="team_members" data-testid="team-members-section">
      <Text size="md">Team Members</Text>
      <Divider my="md" />
      <Card>
        <Card.Section withBorder py="sm" px="lg">
          <Group align="center" justify="space-between">
            <div className="fs-7">Team Members</div>
            {hasAdminAccess && (
              <Button
                data-testid="invite-member-button"
                variant="primary"
                leftSection={<IconUserPlus size={16} />}
                onClick={() => setTeamInviteModalShow(true)}
              >
                Invite Team Member
              </Button>
            )}
          </Group>
        </Card.Section>
        <Card.Section>
          <Table horizontalSpacing="lg" verticalSpacing="xs">
            <Table.Tbody>
              {!isLoadingMembers &&
                Array.isArray(members?.data) &&
                members?.data.map(member => (
                  <Table.Tr key={member.email}>
                    <Table.Td>
                      <div>
                        {member.isCurrentUser && (
                          <Badge variant="light" mr="xs" tt="none">
                            You
                          </Badge>
                        )}
                        <span className="text-white fw-bold fs-7">
                          {member.name}
                        </span>
                      </div>
                      <Group mt={4} fz="xs">
                        <div>{member.email}</div>
                        {member.hasPasswordAuth && (
                          <div>
                            <IconLock size={14} /> Password Auth
                          </div>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {member.role && (
                        <Badge
                          variant="light"
                          color={ROLE_COLORS[member.role] ?? 'gray'}
                          fw="normal"
                          tt="capitalize"
                        >
                          {member.role}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Group justify="flex-end" gap="8">
                        {hasAdminAccess &&
                          !member.isCurrentUser &&
                          member.role !== 'owner' && (
                            <Select
                              size="xs"
                              value={member.role ?? 'member'}
                              data={[
                                { value: 'admin', label: 'Admin' },
                                { value: 'member', label: 'Member' },
                                { value: 'viewer', label: 'Viewer' },
                              ]}
                              onChange={val =>
                                val &&
                                member._id &&
                                handleRoleChange(
                                  member._id,
                                  val as 'admin' | 'member' | 'viewer',
                                )
                              }
                              w={100}
                            />
                          )}
                        {!member.isCurrentUser && hasAdminAccess && (
                          <Button
                            size="compact-sm"
                            variant="danger"
                            onClick={() =>
                              setDeleteTeamMemberConfirmationModalData({
                                mode: 'team',
                                id: member._id,
                                email: member.email,
                              })
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              {!isLoadingInvitations &&
                Array.isArray(invitations?.data) &&
                invitations.data.map(invitation => (
                  <Table.Tr key={invitation.email} className="mt-2">
                    <Table.Td>
                      <span className="text-white fw-bold fs-7">
                        {invitation.email}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="dot" color="gray" fw="normal" tt="none">
                        Pending Invite
                      </Badge>
                      <CopyToClipboard text={invitation.url}>
                        <Button size="compact-xs" variant="secondary" ml="xs">
                          📋 Copy URL
                        </Button>
                      </CopyToClipboard>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {hasAdminAccess && (
                        <Group justify="flex-end" gap="8">
                          <Button
                            size="compact-sm"
                            variant="danger"
                            onClick={() =>
                              setDeleteTeamMemberConfirmationModalData({
                                mode: 'teamInvite',
                                id: invitation._id,
                                email: invitation.email,
                              })
                            }
                          >
                            Delete
                          </Button>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </Card.Section>
      </Card>

      <Modal
        centered
        onClose={() => setTeamInviteModalShow(false)}
        opened={teamInviteModalShow}
        title="Invite Team Member"
      >
        <InviteTeamMemberForm
          onSubmit={onSubmitTeamInviteForm}
          isSubmitting={saveTeamInvitation.isPending}
        />
      </Modal>

      <Modal
        centered
        onClose={() =>
          setDeleteTeamMemberConfirmationModalData({
            mode: null,
            id: null,
            email: null,
          })
        }
        opened={deleteTeamMemberConfirmationModalData.id != null}
        size="lg"
        title="Delete Team Member"
      >
        <Stack>
          <Text>
            Deleting this team member (
            {deleteTeamMemberConfirmationModalData.email}) will revoke their
            access to the team&apos;s resources and services. This action is not
            reversible.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              data-testid="cancel-delete-member"
              variant="secondary"
              onClick={() =>
                setDeleteTeamMemberConfirmationModalData({
                  mode: null,
                  id: null,
                  email: null,
                })
              }
            >
              Cancel
            </Button>
            <Button
              data-testid="confirm-delete-member"
              variant="danger"
              onClick={() =>
                deleteTeamMemberConfirmationModalData.id &&
                onConfirmDeleteTeamMember(
                  deleteTeamMemberConfirmationModalData.id,
                )
              }
            >
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}

function InviteTeamMemberForm({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting?: boolean;
  onSubmit: (arg0: {
    email: string;
    role: 'admin' | 'member' | 'viewer';
  }) => void;
}) {
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');

  return (
    <form
      onSubmit={e => {
        onSubmit({ email, role });
        e.preventDefault();
      }}
    >
      <Stack>
        <TextInput
          data-testid="invite-email-input"
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@company.com"
          withAsterisk={false}
        />
        <Select
          label="Role"
          value={role}
          onChange={val => val && setRole(val as 'admin' | 'member' | 'viewer')}
          data={[
            { value: 'admin', label: 'Admin — can manage members & settings' },
            { value: 'member', label: 'Member — can create & edit resources' },
            { value: 'viewer', label: 'Viewer — read-only access' },
          ]}
        />
        <div className="fs-8">
          The invite link will automatically expire after 30 days.
        </div>
        <Button
          data-testid="send-invite-button"
          variant="primary"
          type="submit"
          disabled={!email || isSubmitting}
        >
          Send Invite
        </Button>
      </Stack>
    </form>
  );
}

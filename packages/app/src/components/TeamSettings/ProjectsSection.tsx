import { useState } from 'react';
import type { Project } from '@hyperdx/common-utils/dist/types';
import {
  ActionIcon,
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
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash, IconUsers } from '@tabler/icons-react';

import api from '@/api';

export default function ProjectsSection() {
  const { data: me } = api.useMe();
  const myRole = me?.role ?? 'member';
  const hasAdminAccess = myRole === 'owner' || myRole === 'admin';

  const { data: members } = api.useTeamMembers();
  const {
    data: projectsData,
    isLoading,
    refetch: refetchProjects,
  } = api.useProjects();

  const createProject = api.useCreateProject();
  const deleteProject = api.useDeleteProject();
  const addMember = api.useAddProjectMember();
  const updateMemberRole = api.useUpdateProjectMemberRole();
  const removeMember = api.useRemoveProjectMember();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [manageMembersProject, setManageMembersProject] =
    useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [addMemberUserId, setAddMemberUserId] = useState<string | null>(null);
  const [addMemberRole, setAddMemberRole] = useState<
    'admin' | 'editor' | 'viewer'
  >('viewer');

  const projects = projectsData?.data ?? [];

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    createProject.mutate(
      {
        name: newProjectName.trim(),
        description: newProjectDesc.trim() || undefined,
      },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: 'Project created' });
          setCreateModalOpen(false);
          setNewProjectName('');
          setNewProjectDesc('');
          refetchProjects();
        },
        onError: () => {
          notifications.show({
            color: 'red',
            message: 'Failed to create project',
          });
        },
      },
    );
  };

  const handleDeleteProject = (id: string) => {
    deleteProject.mutate(
      { id },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: 'Project deleted' });
          refetchProjects();
        },
        onError: () => {
          notifications.show({
            color: 'red',
            message: 'Failed to delete project',
          });
        },
      },
    );
  };

  const handleAddMember = (projectId: string) => {
    if (!addMemberUserId) return;
    addMember.mutate(
      { projectId, userId: addMemberUserId, role: addMemberRole },
      {
        onSuccess: project => {
          notifications.show({ color: 'green', message: 'Member added' });
          setManageMembersProject(project);
          setAddMemberUserId(null);
          setAddMemberRole('viewer');
          refetchProjects();
        },
        onError: () => {
          notifications.show({
            color: 'red',
            message: 'Failed to add member',
          });
        },
      },
    );
  };

  const handleUpdateMemberRole = (
    projectId: string,
    userId: string,
    role: 'admin' | 'editor' | 'viewer',
  ) => {
    updateMemberRole.mutate(
      { projectId, userId, role },
      {
        onSuccess: project => {
          notifications.show({ color: 'green', message: 'Role updated' });
          setManageMembersProject(project);
          refetchProjects();
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

  const handleRemoveMember = (projectId: string, userId: string) => {
    removeMember.mutate(
      { projectId, userId },
      {
        onSuccess: project => {
          notifications.show({ color: 'green', message: 'Member removed' });
          setManageMembersProject(project);
          refetchProjects();
        },
        onError: () => {
          notifications.show({
            color: 'red',
            message: 'Failed to remove member',
          });
        },
      },
    );
  };

  // Members not yet in a given project
  const availableMembers = (project: Project) => {
    const memberIds = new Set(project.members.map(m => m.userId));
    return (members?.data ?? []).filter(m => !memberIds.has(m._id));
  };

  return (
    <Box id="projects">
      <Group justify="space-between" align="center">
        <Text size="md">Projects</Text>
        {hasAdminAccess && (
          <Button
            variant="primary"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => setCreateModalOpen(true)}
          >
            New Project
          </Button>
        )}
      </Group>
      <Divider my="md" />

      <Text size="sm" c="dimmed" mb="md">
        Projects group dashboards and data sources. Members only see resources
        in projects they belong to; resources without a project are visible to
        everyone.
      </Text>

      {isLoading && <Text size="sm">Loading…</Text>}
      {!isLoading && projects.length === 0 && (
        <Card>
          <Text size="sm" c="dimmed" ta="center">
            No projects yet. Create one to start scoping access.
          </Text>
        </Card>
      )}

      <Stack gap="sm">
        {projects.map(project => (
          <Card key={project._id} withBorder>
            <Group justify="space-between" mb="xs">
              <div>
                <Text fw={500}>{project.name}</Text>
                {project.description && (
                  <Text size="xs" c="dimmed">
                    {project.description}
                  </Text>
                )}
              </div>
              <Group gap="xs">
                <Badge variant="light" size="sm">
                  {project.members.length} member
                  {project.members.length !== 1 ? 's' : ''}
                </Badge>
                <Button
                  variant="secondary"
                  size="compact-sm"
                  leftSection={<IconUsers size={14} />}
                  onClick={() => setManageMembersProject(project)}
                >
                  Members
                </Button>
                {hasAdminAccess && (
                  <ActionIcon
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteProject(project._id)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                )}
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      {/* Create project modal */}
      <Modal
        centered
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Project"
      >
        <Stack>
          <TextInput
            label="Name"
            placeholder="My Project"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            required
            withAsterisk={false}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            value={newProjectDesc}
            onChange={e => setNewProjectDesc(e.target.value)}
          />
          <Button
            variant="primary"
            disabled={!newProjectName.trim() || createProject.isPending}
            onClick={handleCreateProject}
          >
            Create
          </Button>
        </Stack>
      </Modal>

      {/* Manage members modal */}
      <Modal
        centered
        opened={manageMembersProject != null}
        onClose={() => setManageMembersProject(null)}
        title={`Members — ${manageMembersProject?.name}`}
        size="lg"
      >
        {manageMembersProject && (
          <Stack>
            <Table>
              <Table.Tbody>
                {manageMembersProject.members.map(m => {
                  const teamMember = members?.data.find(
                    tm => tm._id === m.userId,
                  );
                  return (
                    <Table.Tr key={m.userId}>
                      <Table.Td>
                        <Text size="sm">
                          {teamMember?.name ?? teamMember?.email ?? m.userId}
                        </Text>
                        {teamMember?.email && (
                          <Text size="xs" c="dimmed">
                            {teamMember.email}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          value={m.role}
                          data={[
                            { value: 'admin', label: 'Admin' },
                            { value: 'editor', label: 'Editor' },
                            { value: 'viewer', label: 'Viewer' },
                          ]}
                          onChange={val =>
                            val &&
                            handleUpdateMemberRole(
                              manageMembersProject._id,
                              m.userId,
                              val as 'admin' | 'editor' | 'viewer',
                            )
                          }
                          w={110}
                        />
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            handleRemoveMember(
                              manageMembersProject._id,
                              m.userId,
                            )
                          }
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            <Divider label="Add member" labelPosition="left" />
            <Group align="flex-end" gap="xs">
              <Select
                label="Team member"
                placeholder="Select member"
                value={addMemberUserId}
                onChange={setAddMemberUserId}
                data={availableMembers(manageMembersProject).map(m => ({
                  value: m._id,
                  label: m.name ?? m.email,
                }))}
                style={{ flex: 1 }}
              />
              <Select
                label="Role"
                value={addMemberRole}
                onChange={val =>
                  val && setAddMemberRole(val as 'admin' | 'editor' | 'viewer')
                }
                data={[
                  { value: 'admin', label: 'Admin' },
                  { value: 'editor', label: 'Editor' },
                  { value: 'viewer', label: 'Viewer' },
                ]}
                w={110}
              />
              <Button
                variant="primary"
                onClick={() => handleAddMember(manageMembersProject._id)}
                disabled={!addMemberUserId || addMember.isPending}
              >
                Add
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}

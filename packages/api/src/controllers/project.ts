import mongoose from 'mongoose';

import type { ObjectId } from '@/models';
import type { ProjectRole } from '@/models/project';
import Project from '@/models/project';
import User from '@/models/user';

export async function getProjects(teamId: string | ObjectId) {
  return Project.find({ team: teamId }).sort({ createdAt: -1 });
}

export async function getProject(projectId: string, teamId: string | ObjectId) {
  return Project.findOne({ _id: projectId, team: teamId });
}

export async function createProject(
  teamId: string | ObjectId,
  creatorId: string | ObjectId,
  name: string,
  description?: string,
) {
  const project = new Project({
    name,
    description,
    team: teamId,
    members: [{ userId: creatorId, role: 'admin' }],
  });
  return project.save();
}

export async function updateProject(
  projectId: string,
  teamId: string | ObjectId,
  updates: { name?: string; description?: string },
) {
  return Project.findOneAndUpdate(
    { _id: projectId, team: teamId },
    { $set: updates },
    { new: true },
  );
}

export async function deleteProject(
  projectId: string,
  teamId: string | ObjectId,
) {
  return Project.findOneAndDelete({ _id: projectId, team: teamId });
}

export async function addProjectMember(
  projectId: string,
  teamId: string | ObjectId,
  userId: string,
  role: ProjectRole,
) {
  // Verify user belongs to same team
  const user = await User.findOne({
    _id: userId,
    team: new mongoose.Types.ObjectId(teamId.toString()),
  });
  if (!user) {
    throw new Error('User not found in team');
  }

  return Project.findOneAndUpdate(
    { _id: projectId, team: teamId, 'members.userId': { $ne: userId } },
    { $push: { members: { userId, role } } },
    { new: true },
  );
}

export async function updateProjectMemberRole(
  projectId: string,
  teamId: string | ObjectId,
  userId: string,
  role: ProjectRole,
) {
  return Project.findOneAndUpdate(
    { _id: projectId, team: teamId, 'members.userId': userId },
    { $set: { 'members.$.role': role } },
    { new: true },
  );
}

export async function removeProjectMember(
  projectId: string,
  teamId: string | ObjectId,
  userId: string,
) {
  return Project.findOneAndUpdate(
    { _id: projectId, team: teamId },
    { $pull: { members: { userId: new mongoose.Types.ObjectId(userId) } } },
    { new: true },
  );
}

/**
 * Returns the set of project IDs the user is a member of for a given team.
 * Used to scope dashboard/source access.
 */
export async function getUserProjectIds(
  userId: string | ObjectId,
  teamId: string | ObjectId,
): Promise<string[]> {
  const projects = await Project.find({
    team: teamId,
    'members.userId': userId,
  }).select('_id');
  return projects.map(p => p._id.toString());
}

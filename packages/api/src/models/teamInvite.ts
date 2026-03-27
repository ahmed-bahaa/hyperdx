import mongoose, { Schema } from 'mongoose';
import ms from 'ms';

import type { UserRole } from './user';

interface ITeamInvite {
  createdAt: Date;
  email: string;
  name?: string;
  role: UserRole;
  teamId: string;
  token: string;
  updatedAt: Date;
}

const TeamInviteSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    name: String,
    email: {
      type: String,
      required: true,
    },
    token: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member',
    },
  },
  {
    timestamps: true,
  },
);

TeamInviteSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: ms('30d') / 1000 },
);

TeamInviteSchema.index({ teamId: 1, email: 1 }, { unique: true });

export default mongoose.model<ITeamInvite>('TeamInvite', TeamInviteSchema);

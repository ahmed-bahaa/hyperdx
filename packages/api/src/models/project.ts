import mongoose, { Schema } from 'mongoose';

type ObjectId = mongoose.Types.ObjectId;

export type ProjectRole = 'admin' | 'editor' | 'viewer';

export interface IProjectMember {
  userId: ObjectId;
  role: ProjectRole;
}

export interface IProject {
  _id: ObjectId;
  name: string;
  description?: string;
  team: ObjectId;
  members: IProjectMember[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectDocument = mongoose.HydratedDocument<IProject>;

const ProjectMemberSchema = new Schema<IProjectMember>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer'],
      required: true,
      default: 'viewer',
    },
  },
  { _id: false },
);

export default mongoose.model<IProject>(
  'Project',
  new Schema<IProject>(
    {
      name: { type: String, required: true },
      description: { type: String },
      team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: true,
      },
      members: { type: [ProjectMemberSchema], default: [] },
    },
    {
      timestamps: true,
      toJSON: { virtuals: true },
    },
  ),
);

import mongoose, { Schema, Document } from 'mongoose';

// --- Department ---
export interface IDepartment extends Document {
    name: string;
}

const DepartmentSchema = new Schema<IDepartment>({
    name: { type: String, required: true, unique: true },
});

export const Department = mongoose.model<IDepartment>('Department', DepartmentSchema);

// --- Class Session ---
export interface IClassSession extends Document {
    timetable_id: mongoose.Types.ObjectId;
    teacher_id: mongoose.Types.ObjectId;
    date: string; // YYYY-MM-DD
    status: 'taken' | 'not_taken';
}

const ClassSessionSchema = new Schema<IClassSession>({
    timetable_id: { type: Schema.Types.ObjectId, ref: 'Timetable', required: true },
    teacher_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    status: { type: String, enum: ['taken', 'not_taken'], required: true },
});

// Ensure a teacher can only have one session status per timetable slot per date
ClassSessionSchema.index({ timetable_id: 1, date: 1 }, { unique: true });

export const ClassSession = mongoose.model<IClassSession>('ClassSession', ClassSessionSchema);

// --- User ---
export interface IUser extends Document {
    name: string;
    email: string;
    password: string;
    role: string;
    department_id: mongoose.Types.ObjectId;
    subject_specialization: string;
    employee_id: string;
    extra_classes: number;
}

const UserSchema = new Schema<IUser>({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'teacher' },
    department_id: { type: Schema.Types.ObjectId, ref: 'Department' },
    subject_specialization: { type: String, default: '' },
    employee_id: { type: String, unique: true, sparse: true },
    extra_classes: { type: Number, default: 0 },
});

export const User = mongoose.model<IUser>('User', UserSchema);

// --- Timetable ---
export interface ITimetable extends Document {
    teacher_id: mongoose.Types.ObjectId;
    day: string;
    start_time: string;
    end_time: string;
    subject: string;
    room: string;
    block: string;
    class_name: string;
}

const TimetableSchema = new Schema<ITimetable>({
    teacher_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    subject: { type: String, required: true },
    room: { type: String, default: '' },
    block: { type: String, default: '' },
    class_name: { type: String, default: '' },
});

export const Timetable = mongoose.model<ITimetable>('Timetable', TimetableSchema);

// --- Leave ---
export interface ILeave extends Document {
    teacher_id: mongoose.Types.ObjectId;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
}

const LeaveSchema = new Schema<ILeave>({
    teacher_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    start_time: { type: String },
    end_time: { type: String },
    status: { type: String, default: 'pending' },
});

export const Leave = mongoose.model<ILeave>('Leave', LeaveSchema);

// --- Substitution ---
export interface ISubstitution extends Document {
    leave_id: mongoose.Types.ObjectId;
    original_teacher_id: mongoose.Types.ObjectId;
    substitute_teacher_id: mongoose.Types.ObjectId;
    date: string;
    start_time: string;
    end_time: string;
    status: 'pending' | 'confirmed' | 'rejected';
}

const SubstitutionSchema = new Schema<ISubstitution>({
    leave_id: { type: Schema.Types.ObjectId, ref: 'Leave', required: true },
    original_teacher_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    substitute_teacher_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    status: { type: String, default: 'pending' },
});

export const Substitution = mongoose.model<ISubstitution>('Substitution', SubstitutionSchema);

// --- Notification ---
export interface INotification extends Document {
    user_id: mongoose.Types.ObjectId;
    message: string;
    type: string;
    is_read: boolean;
    created_at: Date;
    related_id?: mongoose.Types.ObjectId;
}

const NotificationSchema = new Schema<INotification>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    type: { type: String, required: true },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
    related_id: { type: Schema.Types.ObjectId, sparse: true }, // For substitution_id etc.
});

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

// --- Seed Departments ---
export async function seedDepartments() {
    const count = await Department.countDocuments();
    if (count === 0) {
        const depts = ['Science', 'Mathematics', 'English', 'History', 'Computer Science', 'Arts'];
        await Department.insertMany(depts.map(name => ({ name })));
        console.log('Departments seeded.');
    }
}

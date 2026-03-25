import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { IUser } from "../types";

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      // select: false means password is NEVER returned by default in queries.
      // You must explicitly opt-in with: User.findById(id).select('+password')
      // This is the correct pattern — safer than remembering to strip it manually.
      select: false,
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "admin", "finance", "manager"],
      default: "user",
    },
    companyId: {
      type: Schema.Types.ObjectId,
      // ref value must match the string passed to mongoose.model('Company', ...)
      ref: "Company",
      required: [true, "Company is required"],
    },
    department: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    // timestamps: true auto-adds createdAt and updatedAt fields managed by Mongoose.
    timestamps: true,
  },
);

// ─────────────────────────────────────────────
// 🔒 PRE-SAVE HOOK — hash password
// ─────────────────────────────────────────────
// Fires before every .save() call.
// isModified('password') guards against re-hashing an already-hashed password
// when other fields are updated (e.g. updating email or role).
// We do NOT call next() here — Mongoose 6+ async pre-hooks don't need it.
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ─────────────────────────────────────────────
// 📝 POST-SAVE HOOK — update lastLogin on auth
// ─────────────────────────────────────────────
// A lightweight example of a post hook. In auth.ts you can call user.save()
// after a successful login and this will fire automatically.
// Alternatively you can call User.findByIdAndUpdate directly — up to you.
userSchema.post("save", function (doc) {
  // Useful for debugging schema issues during development
  if (process.env.NODE_ENV === "development") {
    console.log(`[User] saved: ${doc.email} (${doc._id})`);
  }
});

// ─────────────────────────────────────────────
// 🔑 METHOD — comparePassword
// ─────────────────────────────────────────────
// Instance method available on every User document.
// Used in auth routes: const isMatch = await user.comparePassword(inputPassword)
// bcrypt.compare handles timing-safe comparison (no timing attacks).
// NOTE: because password has select:false, you must fetch the user with
// .select('+password') before calling this method.
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─────────────────────────────────────────────
// 🪄 VIRTUAL — fullName
// ─────────────────────────────────────────────
// Virtuals are computed properties not stored in MongoDB.
// They appear in .toJSON() / .toObject() output but aren't queryable.
// Use for display-only derived fields.
userSchema.virtual("fullName").get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`;
});

// ─────────────────────────────────────────────
// 📤 SERIALIZE — include virtuals in JSON output
// ─────────────────────────────────────────────
// toJSON: applies when res.json(user) is called in a route handler.
// toObject: applies when spreading/accessing the plain object manually.
// Both need virtuals:true for fullName to appear.
// transform strips __v (Mongoose's internal version key) from API responses.
userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });

// ─────────────────────────────────────────────
// 🗂️ INDEXES
// ─────────────────────────────────────────────
// email unique index is already created by unique:true above.
// Additional compound index for the most common query pattern:
// "fetch all users belonging to a company"
userSchema.index({ companyId: 1, isActive: 1 });

export default mongoose.model<IUser>("User", userSchema);

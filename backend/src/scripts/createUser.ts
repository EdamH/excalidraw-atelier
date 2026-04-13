import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connect } from '../db';
import { User } from '../models/User';

async function main(): Promise<void> {
  const [, , emailArg, passwordArg, ...nameParts] = process.argv;
  if (!emailArg || !passwordArg || nameParts.length === 0) {
    console.error(
      'Usage: ts-node createUser.ts <email> <password> <name>'
    );
    process.exit(1);
  }
  const email = emailArg.toLowerCase().trim();
  const password = passwordArg;
  const name = nameParts.join(' ').trim();

  try {
    await connect();
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await User.findOne({ email });
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.name = name;
      await existing.save();
      console.log(`Updated user ${email} (${existing._id.toString()})`);
    } else {
      const created = await User.create({
        email,
        passwordHash,
        name,
        createdAt: new Date(),
      });
      console.log(`Created user ${email} (${created._id.toString()})`);
    }
  } catch (err) {
    console.error('createUser failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();

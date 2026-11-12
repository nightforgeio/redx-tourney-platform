import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, 'Username: letters, numbers, underscore only'),
  email: z.string().email(),
  phone: z.string().regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  ff_uid: z.string().max(20).optional().or(z.literal('')),
  ff_ign: z.string().max(30).optional().or(z.literal('')),
});

export const loginSchema = z.object({
  identifier: z.string().min(3).max(120),
  password: z.string().min(1),
});

export const profileSchema = z.object({
  ff_uid: z.string().max(20).optional(),
  ff_ign: z.string().max(30).optional(),
  phone: z.string().regex(/^[0-9+\-\s]{7,15}$/).optional().or(z.literal('')),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
});

export const tournamentSchema = z.object({
  title: z.string().min(3).max(80),
  banner_url: z.string().url().optional().or(z.literal('')),
  mode: z.enum(['br', 'cs']),
  format: z.enum(['solo', 'duo', 'squad']),
  max_slots: z.coerce.number().int().min(0).max(10000),
  event_date: z.string().optional().or(z.literal('')),
  event_time: z.string().optional().or(z.literal('')),
  prize_pool: z.coerce.number().int().min(0).max(100_000_000),
  announcement: z.string().max(2000).optional().or(z.literal('')),
});

export const roomSchema = z.object({
  room_id: z.string().min(1).max(50),
  password: z.string().min(1).max(50),
  visible: z.boolean().optional(),
});

export const matchResultSchema = z.object({
  match_id: z.coerce.number().int(),
  rows: z.array(z.object({
    user_id: z.coerce.number().int(),
    placement: z.coerce.number().int().min(1).optional().nullable(),
    kills: z.coerce.number().int().min(0).max(999).default(0),
  })).min(1).max(1000),
});

export const redeemSchema = z.object({
  amount: z.coerce.number().int().min(1).max(10_000_000),
  payment_type: z.enum(['upi', 'phone']),
  payment_number: z.string().min(5).max(50),
});

export const coadminSchema = z.object({
  user_id: z.coerce.number().int(),
  grant: z.boolean(),
});
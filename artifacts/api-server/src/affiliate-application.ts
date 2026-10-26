import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable()
  .transform((value) => value || null);

export const affiliateApplicationInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: optionalText(40),
  country: optionalText(100),
  promotionMethod: optionalText(2000),
  socialMedia: optionalText(500),
});
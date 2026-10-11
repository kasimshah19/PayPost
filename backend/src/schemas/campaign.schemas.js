const { z } = require('zod');

const createCampaignSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  budgetPaise: z.number().int().positive(),
  perCreatorFeePaise: z.number().int().positive(),
  slots: z.number().int().min(1).max(1000),
  applicationDeadline: z.string().datetime(),
  submissionDeadline: z.string().datetime()
}).refine(data => data.perCreatorFeePaise <= data.budgetPaise, {
  message: "Fee per creator cannot exceed total budget",
  path: ["perCreatorFeePaise"]
}).refine(data => new Date(data.applicationDeadline) > new Date(), {
  message: "Application deadline must be in the future",
  path: ["applicationDeadline"]
}).refine(data => new Date(data.submissionDeadline) > new Date(data.applicationDeadline), {
  message: "Submission deadline must be after application deadline",
  path: ["submissionDeadline"]
});

const updateCampaignSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(2000).optional(),
  budgetPaise: z.number().int().positive().optional(),
  perCreatorFeePaise: z.number().int().positive().optional(),
  slots: z.number().int().min(1).max(1000).optional(),
  applicationDeadline: z.string().datetime().optional(),
  submissionDeadline: z.string().datetime().optional()
});

const cancelCampaignSchema = z.object({
  cancelReason: z.string().min(3).max(300)
});

const browseCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(50).optional(),
  sort: z.enum(['newest', 'fee_desc', 'ending_soon']).default('newest'),
  minFeePaise: z.coerce.number().int().min(0).optional()
});

module.exports = {
  createCampaignSchema,
  updateCampaignSchema,
  cancelCampaignSchema,
  browseCampaignsQuerySchema
};

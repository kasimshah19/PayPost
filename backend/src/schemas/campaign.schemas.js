const { z } = require('zod');

const createCampaignSchema = z.object({
  body: z.object({
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
  })
});

const updateCampaignSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(120).optional(),
    description: z.string().max(2000).optional(),
    budgetPaise: z.number().int().positive().optional(),
    perCreatorFeePaise: z.number().int().positive().optional(),
    slots: z.number().int().min(1).max(1000).optional(),
    applicationDeadline: z.string().datetime().optional(),
    submissionDeadline: z.string().datetime().optional()
  })
});

const cancelCampaignSchema = z.object({
  body: z.object({
    cancelReason: z.string().min(3).max(300)
  })
});

module.exports = {
  createCampaignSchema,
  updateCampaignSchema,
  cancelCampaignSchema
};

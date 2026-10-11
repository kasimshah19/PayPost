const { z } = require('zod');

const submitDeliverableSchema = z.object({
  postUrl: z.string().min(1, 'Instagram post URL is required'),
  note: z.string().max(500).optional()
});

const resubmitDeliverableSchema = z.object({
  postUrl: z.string().min(1, 'Instagram post URL is required'),
  note: z.string().max(500).optional()
});

const approveSubmissionSchema = z.object({
  note: z.string().max(1000).optional()
});

const requestRevisionSchema = z.object({
  note: z.string().min(5, 'Note is required and must be at least 5 characters').max(1000)
});

const rejectSubmissionSchema = z.object({
  note: z.string().min(5, 'Note is required and must be at least 5 characters').max(1000)
});

// Backward compatibility schema
const submitWorkSchema = submitDeliverableSchema;

const reviewSubmissionSchema = z.object({
  action: z.enum(['approved', 'revision_requested', 'rejected']),
  note: z.string().max(1000).optional()
}).refine(data => {
  if (['revision_requested', 'rejected'].includes(data.action)) {
    return Boolean(data.note && data.note.trim().length >= 5);
  }
  return true;
}, {
  message: 'Note is required and must be at least 5 characters',
  path: ['note']
});

module.exports = {
  submitDeliverableSchema,
  resubmitDeliverableSchema,
  approveSubmissionSchema,
  requestRevisionSchema,
  rejectSubmissionSchema,
  submitWorkSchema,
  reviewSubmissionSchema
};

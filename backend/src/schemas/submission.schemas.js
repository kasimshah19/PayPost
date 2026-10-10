const Joi = require('joi');
const { SUBMISSION_STATUS } = require('../constants');

const submitWorkSchema = Joi.object({
  postUrl: Joi.string()
    .uri({ scheme: ['https'] })
    .pattern(/instagram\.com/)
    .required()
    .messages({
      'string.pattern.base': 'URL must be a valid Instagram link',
      'string.uri': 'Must be a valid HTTPS URL'
    }),
  note: Joi.string().max(500).optional()
});

const reviewSubmissionSchema = Joi.object({
  action: Joi.string().valid('approved', 'revision_requested', 'rejected').required(),
  note: Joi.string().max(1000).when('action', {
    is: Joi.valid('revision_requested', 'rejected'),
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

module.exports = {
  submitWorkSchema,
  reviewSubmissionSchema
};

const campaignService = require('../services/campaign.service');

exports.createCampaign = async (req, res, next) => {
  try {
    const campaign = await campaignService.create(req.body, req.user.id);
    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
};

exports.getMine = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const campaigns = await campaignService.getMine(req.user.id, { page, limit, status });
    res.json(campaigns);
  } catch (error) {
    next(error);
  }
};

exports.getMineSummary = async (req, res, next) => {
  try {
    const summary = await campaignService.getMineSummary(req.user.id);
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

exports.browseCampaigns = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const campaigns = await campaignService.browseCreator({ page, limit }, req.user.id);
    res.json(campaigns);
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const campaign = await campaignService.getById(req.params.id, req.user);
    res.json(campaign);
  } catch (error) {
    next(error);
  }
};

exports.updateCampaign = async (req, res, next) => {
  try {
    const campaign = await campaignService.update(req.params.id, req.body, req.user.id);
    res.json(campaign);
  } catch (error) {
    next(error);
  }
};

exports.cancelCampaign = async (req, res, next) => {
  try {
    const { cancelReason } = req.body;
    const campaign = await campaignService.cancel(req.params.id, cancelReason, req.user.id);
    res.json(campaign);
  } catch (error) {
    next(error);
  }
};

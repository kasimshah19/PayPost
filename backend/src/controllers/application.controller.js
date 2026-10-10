const applicationService = require('../services/application.service');

class ApplicationController {
  async apply(req, res, next) {
    try {
      const { id: campaignId } = req.params;
      const creatorId = req.user.id;
      const pitch = req.body.pitch;

      const application = await applicationService.applyToCampaign(campaignId, creatorId, pitch);
      res.status(201).json(application);
    } catch (error) {
      next(error);
    }
  }

  async getMine(req, res, next) {
    try {
      const creatorId = req.user.id;
      const { status } = req.query;
      const applications = await applicationService.listMyApplications(creatorId, status);
      res.json(applications);
    } catch (error) {
      next(error);
    }
  }

  async withdraw(req, res, next) {
    try {
      const { id: applicationId } = req.params;
      const creatorId = req.user.id;
      const application = await applicationService.withdrawApplication(applicationId, creatorId);
      res.json(application);
    } catch (error) {
      next(error);
    }
  }

  async getCampaignApplications(req, res, next) {
    try {
      const { id: campaignId } = req.params;
      const brandId = req.user.id;
      const { status } = req.query;
      
      const data = await applicationService.listCampaignApplications(campaignId, brandId, status);
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async approve(req, res, next) {
    try {
      const { id: applicationId } = req.params;
      const brandId = req.user.id;
      
      const data = await applicationService.approveApplication(applicationId, brandId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async reject(req, res, next) {
    try {
      const { id: applicationId } = req.params;
      const brandId = req.user.id;
      const note = req.body.note;

      const application = await applicationService.rejectApplication(applicationId, note, brandId);
      res.json(application);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ApplicationController();

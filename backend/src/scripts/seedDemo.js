const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Campaign = require('../models/Campaign');
const campaignService = require('../services/campaign.service');
const applicationService = require('../services/application.service');
const submissionService = require('../services/submissionService');
const walletService = require('../services/walletService');
const { checkIntegrity } = require('../services/integrityService');


async function runSeed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL: seed:demo cannot be run in production environment!');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to database.\n');

    const DEMO_PASSWORD = 'Password123!';
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    // 1. Create or retrieve Demo Brand
    let brand = await User.findOne({ email: 'brand@demo.paypost.test' });
    if (!brand) {
      brand = await User.create({
        name: 'Aura Lifestyle Brands',
        email: 'brand@demo.paypost.test',
        passwordHash,
        role: 'brand'
      });
      console.log('Created Brand: brand@demo.paypost.test');
    } else {
      console.log('Existing Brand found: brand@demo.paypost.test');
    }

    // 2. Create or retrieve 3 Demo Creators
    const creatorDefs = [
      { name: 'Aarav Sharma', email: 'creator1@demo.paypost.test' },
      { name: 'Priya Patel', email: 'creator2@demo.paypost.test' },
      { name: 'Rohan Mehta', email: 'creator3@demo.paypost.test' }
    ];

    const creators = [];
    for (const def of creatorDefs) {
      let creator = await User.findOne({ email: def.email });
      if (!creator) {
        creator = await User.create({
          name: def.name,
          email: def.email,
          passwordHash,
          role: 'creator'
        });
        console.log(`Created Creator: ${def.email}`);
      } else {
        console.log(`Existing Creator found: ${def.email}`);
      }
      await walletService.ensureWallet(creator._id);
      creators.push(creator);
    }

    const now = Date.now();
    const in3Days = new Date(now + 3 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(now + 7 * 24 * 60 * 60 * 1000);
    const in10Days = new Date(now + 10 * 24 * 60 * 60 * 1000);

    // 3. Campaign 1: Open for applications
    let camp1 = await Campaign.findOne({ brand: brand._id, title: 'Summer Fit Launch 2026' });
    if (!camp1) {
      camp1 = await campaignService.create({
        title: 'Summer Fit Launch 2026',
        description: 'Post high-energy fitness reels showcasing our new breathable workout apparel line.',
        budgetPaise: 1000000, // ₹10,000
        perCreatorFeePaise: 200000, // ₹2,000
        slots: 4,
        applicationDeadline: in3Days,
        submissionDeadline: in7Days
      }, brand._id);
      console.log('Created Open Campaign: Summer Fit Launch 2026');
    } else {
      console.log('Skipping existing campaign: Summer Fit Launch 2026');
    }

    // 4. Campaign 2: Active with pending submissions
    let camp2 = await Campaign.findOne({ brand: brand._id, title: 'Organic Chai Reels' });
    if (!camp2) {
      camp2 = await campaignService.create({
        title: 'Organic Chai Reels',
        description: 'Create aesthetic morning routine reels featuring Organic Chai blend with packaging visible.',
        budgetPaise: 600000, // ₹6,000
        perCreatorFeePaise: 200000, // ₹2,000
        slots: 2,
        applicationDeadline: in3Days,
        submissionDeadline: in10Days
      }, brand._id);
      console.log('Created Campaign: Organic Chai Reels');

      // Creator 1 applies & gets approved
      const app1 = await applicationService.applyToCampaign(camp2._id, creators[0]._id, 'I have 50k tea lovers following my daily routine!');
      await applicationService.approveApplication(app1._id, brand._id);

      // Creator 2 applies & gets approved
      const app2 = await applicationService.applyToCampaign(camp2._id, creators[1]._id, 'Aesthetic videographer ready to shoot 4K chai reel.');
      await applicationService.approveApplication(app2._id, brand._id);

      // Creator 1 submits deliverable (pending brand review)
      await submissionService.submitDeliverable(app1._id, creators[0]._id, {
        postUrl: 'https://www.instagram.com/p/C-chaiMorning123/',
        note: 'Here is the reel with proper product placement!'
      });
      console.log('  -> Creator 1 & 2 approved; Creator 1 submitted deliverable (Needs Review).');
    } else {
      console.log('Skipping existing campaign: Organic Chai Reels');
    }

    // 5. Campaign 3: Active with Revision Requested
    let camp3 = await Campaign.findOne({ brand: brand._id, title: 'Tech Glow Gadget Review' });
    if (!camp3) {
      camp3 = await campaignService.create({
        title: 'Tech Glow Gadget Review',
        description: 'Unboxing and features breakdown of the smart desk lamp.',
        budgetPaise: 400000, // ₹4,000
        perCreatorFeePaise: 200000, // ₹2,000
        slots: 1,
        applicationDeadline: in3Days,
        submissionDeadline: in7Days
      }, brand._id);
      console.log('Created Campaign: Tech Glow Gadget Review');

      const app3 = await applicationService.applyToCampaign(camp3._id, creators[2]._id, 'Tech creator with high engagement.');
      await applicationService.approveApplication(app3._id, brand._id);

      const sub3 = await submissionService.submitDeliverable(app3._id, creators[2]._id, {
        postUrl: 'https://www.instagram.com/reel/C-techGlowLamp999/',
        note: 'Quick unboxing reel done.'
      });

      await submissionService.requestRevision(sub3._id, brand._id, {
        note: 'Please show the product in the first 3 seconds.'
      });
      console.log('  -> Creator 3 applied, submitted, and brand requested revision.');
    } else {
      console.log('Skipping existing campaign: Tech Glow Gadget Review');
    }

    // 6. Campaign 4: Paid Out (Completed through real ledger)
    let camp4 = await Campaign.findOne({ brand: brand._id, title: 'Monsoon Fashion Lookbook' });
    if (!camp4) {
      camp4 = await campaignService.create({
        title: 'Monsoon Fashion Lookbook',
        description: 'Style 3 monsoon outfits in 30 seconds.',
        budgetPaise: 500000, // ₹5,000
        perCreatorFeePaise: 250000, // ₹2,500
        slots: 1,
        applicationDeadline: in3Days,
        submissionDeadline: in7Days
      }, brand._id);
      console.log('Created Campaign: Monsoon Fashion Lookbook');

      const app4 = await applicationService.applyToCampaign(camp4._id, creators[0]._id, 'Monsoon styling specialist.');
      await applicationService.approveApplication(app4._id, brand._id);

      const sub4 = await submissionService.submitDeliverable(app4._id, creators[0]._id, {
        postUrl: 'https://www.instagram.com/p/C-monsoonOutfits888/',
        note: 'Final approved style lookbook.'
      });

      // Brand approves deliverable -> triggers payout through real ledger entries!
      await submissionService.approveSubmission(sub4._id, brand._id, {
        note: 'Looks great! Approved payout.'
      });
      console.log('  -> Creator 1 applied, submitted, and payout approved (Ledger updated).');
    } else {
      console.log('Skipping existing campaign: Monsoon Fashion Lookbook');
    }

    console.log('\n======================================================');
    console.log(' DEMO DATA SEEDED SUCCESSFULLY');
    console.log('======================================================');
    console.log('Shared Password for all demo accounts: ' + DEMO_PASSWORD);
    console.log('Brand Account:   brand@demo.paypost.test');
    console.log('Creator 1:       creator1@demo.paypost.test (Has ₹2,250 net balance)');
    console.log('Creator 2:       creator2@demo.paypost.test (Approved, needs submission)');
    console.log('Creator 3:       creator3@demo.paypost.test (Needs revision resubmission)');
    console.log('======================================================\n');

    // Run integrity audit on ledger
    console.log('Running Wallet Integrity Audit on Seeded Data...');
    const auditReport = await checkIntegrity();
    console.log('Integrity Audit Result:', auditReport.ok ? 'ALL CHECKS PASSED [OK]' : 'FAILURES DETECTED');
    if (!auditReport.ok) {
      console.error(auditReport.errors);
      process.exit(1);
    }

    console.log('\nSeeding completed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding demo data:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runSeed();

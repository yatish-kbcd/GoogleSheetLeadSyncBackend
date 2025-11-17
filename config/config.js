// config/config.js
import dotenv from 'dotenv';

dotenv.config();

const config = {
  getLeadCreate: process.env.getLeadCreate || 'https://pujariwala.in/jwt_vir_apis/get_googlesheet_lead_create',
};

export default config;

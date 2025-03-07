require('dotenv').config();

require('./automation').automateRecoru(process.env.AUTH_ID, process.env.PASSWORD, process.env.CONTRACT_ID);

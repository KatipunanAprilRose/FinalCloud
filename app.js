const express = require('express');
const AWS = require('aws-sdk');
const CompressJS = require('compressjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
require("dotenv").config();
const app = express();

app.use(express.json());

// Initialize SQS
const sqs = new AWS.SQS({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: 'ap-southeast-2',
});

const sqsQueueURL = process.env.SQS_URL;

app.post('/compress', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  // Send a message to the SQS queue to process the compression
  const messageParams = {
    QueueUrl: sqsQueueURL,
    MessageBody: JSON.stringify({
      originalFilePath: req.file.path,
      originalFileName: req.file.originalname,   
    }),
  };

  sqs.sendMessage(messageParams, (sqsErr, sqsData) => {
    if (sqsErr) {
      console.error('Error sending message to SQS:', sqsErr);
      res.status(500).send('Error sending message to SQS');
    } else {
      console.log('Message sent to SQS:', sqsData.MessageId);      
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/index.html'));
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
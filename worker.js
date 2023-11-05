const AWS = require('aws-sdk');
const CompressJS = require('compressjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
require("dotenv").config();
const Websocket = require('ws');
const currentTimestamp = new Date().getTime();

const wss = new Websocket.Server({ port:8080 });
let zipS3Url = null;

// Initialize AWS SQS and S3
const sqs = new AWS.SQS({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: 'ap-southeast-2',
});

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: 'ap-southeast-2',
});

const sqsQueueURL = process.env.SQS_URL;
const bucketName = process.env.BUCKET_NAME;

// Function to process messages from the SQS queue
const compressFile = (originalFilePath, originalFileName) => {
  return new Promise((resolve, reject) => {
    try {
      const compressedData = CompressJS.Bzip2.compressFile(fs.readFileSync(originalFilePath));
      const compressedFilePath = path.join(__dirname, 'uploads', originalFileName + `_${currentTimestamp}.bz2`);
      fs.writeFileSync(compressedFilePath, compressedData);
      resolve(compressedFilePath);
    } catch (error) {
      reject(error);
    }
  });
}

const uploadToS3 = (compressedFilePath, originalFileName) => {
  return new Promise((resolve, reject) => {
    const s3Key = originalFileName + `_${currentTimestamp}.bz2`;
    const s3Params = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fs.createReadStream(compressedFilePath),
    };

    s3.upload(s3Params, (s3Err, s3Data) => {
      if (s3Err) {
        reject(s3Err);
      } else {
        resolve(s3Data.Location);
      }
    });
  });
}

const processMessage = async (message) => {
  try {
    const body = JSON.parse(message.Body);
    const { originalFilePath, originalFileName } = body;

    // Compress the file
    const compressedFilePath = await compressFile(originalFilePath, originalFileName);

    // Upload the compressed file to AWS S3
    const s3Url = await uploadToS3(compressedFilePath, originalFileName);

    // Cleanup: Remove the temporary compressed file and original file
    fs.unlinkSync(compressedFilePath);

    fs.unlink(originalFilePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error('Error deleting the original uploaded file:', unlinkErr);
      } else {
        console.log('Original File: ' + originalFileName + ' DELETED.');
      }
    });

    // Now you can return the S3 URL or use it as needed
    //console.log('S3 URL:', s3Url);

  } catch (error) {
    console.error('Error processing message:', error);
  }
};



// Poll the SQS queue for messages
const pollQueue = () => {
  const params = {
    QueueUrl: sqsQueueURL,
    MaxNumberOfMessages: 5,
    WaitTimeSeconds: 20,
  };

  sqs.receiveMessage(params, (err, data) => {
    if (err) {
      console.error('Error receiving messages from SQS:', err);
    } else if (data.Messages) {
      data.Messages.forEach((message) => {
        console.log('Message receive. Compressing now.');
        processMessage(message);
        console.log('Done processing.');
        // Delete the processed message from the queue
        sqs.deleteMessage(
          {
            QueueUrl: sqsQueueURL,
            ReceiptHandle: message.ReceiptHandle,
          },
          (deleteErr) => {
            if (deleteErr) {
              console.error('Error deleting message from SQS:', deleteErr);
            }
          }
        );
      });
    }

    // Continue polling for messages
    pollQueue();
  });
};

// Start polling the SQS queue for messages
pollQueue();
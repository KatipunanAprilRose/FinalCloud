const express = require('express');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');
const CompressJS = require('compressjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const app = express();
require("dotenv").config();

app.use(bodyParser.json());

// Initialize AWS S3 and SQS
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "ap-southeast-2",
});

var sqs = new AWS.SQS({apiVersion: '2012-11-05', region: "ap-southeast-2"});

// Define S3 bucket name
const bucketName = 'cloudproject83';

const queueUrl = 'https://sqs.ap-southeast-2.amazonaws.com/901444280953/cloudproject83';

// Handle file compression and upload
app.post('/compress', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const originalFilePath = req.file.path;
  let compressedFilePath; 

  // Use try-catch to handle errors during file compression
  try {
    const compressedData = CompressJS.Bzip2.compressFile(fs.readFileSync(originalFilePath));

    // Use the original file name for the compressed file
    compressedFilePath = path.join(__dirname, 'uploads', req.file.originalname + '.bz2');
    fs.writeFileSync(compressedFilePath, compressedData);
  } catch (err) {
    // Handle errors during compression
    return res.status(500).send('Error during compression: ' + err.message);
  }

    // Send a message to the user's SQS queue to handle the upload
    const message = {
      originalFileName: req.file.originalname,
      compressedFilePath: compressedFilePath,
    };

    const params = {
      MessageBody: JSON.stringify(message),
      QueueUrl: queueUrl,
    };

    sqs.sendMessage(params, (err, data) => {
      if (err) {
        console.error('Error sending message to SQS:', err);
        res.status(500).send('Error sending message to SQS');
      } else {
        console.log('Message sent to SQS:', data.MessageId);

        // Upload the compressed file to AWS S3
        const s3Params = {
          Bucket: bucketName,
          Key: req.file.originalname + '.bz2', // Use the original filename
          Body: fs.createReadStream(compressedFilePath), // Use the compressed file
        };

        s3.upload(s3Params, (s3Err, s3Data) => {
          if (s3Err) {
            console.error('Error uploading file to S3:', s3Err);
            res.status(500).send('Error uploading file to S3');
          } else {
            console.log('File uploaded to S3:', s3Data.Location);

            // Cleanup: Remove the temporary compressed file and the original file
            fs.unlinkSync(compressedFilePath);

            fs.unlink(originalFilePath, (unlinkErr) => {
              if (unlinkErr) {
                console.error('Error deleting the original uploaded file:', unlinkErr);
              } else {
                console.log('Original uploaded file deleted.');
              }
            });

            // Return the S3 URL of the compressed file to the client
            const s3Url = s3Data.Location;
            res.status(200).send(s3Url);
          }
        });
      }
    });
  });

function generateUserId() {
  return Math.random().toString(36).substr(2, 9);
}

// Start listening to messages from the user's SQS queue
sqs.on('ready', () => {
  console.log('SQS worker is ready and listening for user-specific messages.');
  // Replace with logic to process user-specific messages
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/index.html'));
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

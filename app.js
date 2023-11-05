const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const bodyParser = require('body-parser');
const upload = multer({ dest: 'uploads/' });
require("dotenv").config();

const app = express();
app.use(express.json());

const s3UrlQueue = []; // Shared queue to store S3 URLs

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
  
 res.send('ok');
});

app.post('/store-s3-url', (req, res) => {
  const s3Url = req.body.s3Url;
  s3UrlQueue.push(s3Url); // Push the S3 URL to the shared queue
  res.status(200).send(s3Url);
});

app.get('/retrieve-s3-url', (req, res) => {
  if (s3UrlQueue.length === 0) {
    res.status(404).send('S3 URL not available yet.');
  } else {
    const s3Url = s3UrlQueue.shift(); // Retrieve and remove the first URL from the queue    
    res.json({ s3Url });
  }
});


app.use(express.static('public'));
app.use('/css',express.static(__dirname+ 'public/css'));
app.use('/img',express.static(__dirname+ 'public/img'));

app.set('views','./views')
app.set('view engine','ejs')

app.get('', (req, res) => {
  res.render('index');
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
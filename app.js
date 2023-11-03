const express = require('express');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');
const CompressJS = require('compressjs');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const app = express();

app.use(bodyParser.json());

// Initialize AWS S3 and SQS clients
const s3 = new AWS.S3({
  // Configure AWS S3 credentials here
  accessKeyId: 'ASIA5DYSEEJ465MAKDEB',
  secretAccessKey: 'hD46OWv8xVfDbrmmfJNE2o0ZagBvrhd2XBwa460f',
  sessionToken: 'IQoJb3JpZ2luX2VjEAgaDmFwLXNvdXRoZWFzdC0yIkgwRgIhAM5J2XSqTB3JdbUinH4pz7ak2a785a8h2N6hyiYf13QoAiEAjx7SuPpJ3GejMHm2cInj53BFJP8WyAwaRcFH6jyxKMEqpQMIQRADGgw5MDE0NDQyODA5NTMiDODTd/BxClAwKsFIpSqCA7VFAoTJn6ICoifzmA4nRgmIpgBSSvAk4JcY1mcDcGWP3TmxRC2p2Eg7470TM696wTXV9LAzAb9oYFy//oTxAi6CaIKQyzslDEUpseDwWpeUoN7sF7N+rzjLKvOwTHvR551rflHYqW39eTxuhQH87ZrenvZkGkfs71oyg5OZzNm85LrnxSYb4mK5tvoxpxZ7CrzBVluGC0YYJnW0nDdYn2esZvQScpxpOcn1or7J59XBe2Uj396RE8V8Q6gYG3I7qsN7MUUKKd1afo+OEnQwfkJuFlAtWMXpWUHnsLiYZo+3M6szqDaarf77FAqXmWF5iKdQo5wba7ivoMSu/38rJkbzeYtBBDKMKDHQF4gLoQb8RR6spLYh/uVziYKVji6DKJLo2H1cot9fXLSxR2aWhYu5sJxKUv8sh9/gWq1cKs4qInpjZMrxwxMN1qVJ9mq1nkLLZUppYhCGCbqWMrwV7WSIgxctisgaup9Ekl8Ssc7G7sIabas0JWh0/AeozQz5oAiPMPLJkqoGOqUBC0SKd49D2W+gOklRByzKnrNsAtLBWrEYNVrYN4gkauBcm0eqRtPOg6Rlu5N9DkQe06YTJE7lPYY60yIs1n9zW/05F8+RWqz31ci2xap2sWwblR4+KgYutG9QAObBRSH2qreHfTvsvj8gbF/S4MsfNKPneKG507wmjGYhU/3E7/lUAEknR9dW7B0yPPKBEwO7b8q2gRqVZEuN6+/JpmaWJ5g9Hqq9',
  region: 'ap-southeast-2'
});
const sqs = new AWS.SQS({ region: 'ap-southeast-2' });

// Define S3 bucket name
const bucketName = 'cloudproject83';

// Handle file compression and upload
app.post('/compress', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const originalFilePath = req.file.path;
  let compressedFilePath; // Declare the variable here

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

  // Now, you can upload the compressed file to AWS S3
  // Define the S3 parameters
  const params = {
    Bucket: bucketName,
    Key: req.file.originalname + '.bz2', // Use the original filename
    Body: fs.createReadStream(compressedFilePath),  // Use the compressed file
  };

  // Upload the compressed file to S3
  s3.upload(params, (err, data) => {
    if (err) {
      console.error('Error uploading file to S3:', err);
      res.status(500).send('Error uploading file to S3');
    } else {
      console.log('File uploaded to S3:', data.Location);

      // Cleanup: Remove the temporary compressed file
      fs.unlinkSync(compressedFilePath);

      res.status(200).send(data.Location);
    }
  });
});



// SQS Queue for handling compress requests
app.post('/queue', (req, res) => {
  const { filename, data } = req.body;

  // Create a unique filename with a .zip extension
  const zipFilename = `${uuidv4()}.zip`;

  // Compress the file using compressjs
  const zipData = CompressJS.LZString.compressToBase64(data);

  // Create a writeable stream from the compressed data
  const zipStream = new Buffer.from(zipData, 'base64');

  // Define the S3 parameters
  const params = {
    Bucket: bucketName,
    Key: zipFilename,
    Body: zipStream,
  };

  // Send a message to SQS for processing
  sqs.sendMessage(
    {
      QueueUrl: 'https://sqs.ap-southeast-2.amazonaws.com/901444280953/cloudproject83.fifo',
      MessageBody: JSON.stringify(params),
    },
    (err, data) => {
      if (err) {
        console.error('Error sending message to SQS:', err);
        res.status(500).send('Error sending message to SQS');
      } else {
        console.log('Message sent to SQS:', data.MessageId);
        res.status(200).send(data.MessageId);
      }
    }
  );
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/index.html'));
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

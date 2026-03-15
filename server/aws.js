const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// ── AWS Config (points to LocalStack) ──
const awsConfig = {
  region: "us-east-1",
  endpoint: process.env.LOCALSTACK_URL || "http://localhost:4566",
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
  forcePathStyle: true,
};

const ssmClient = new SSMClient(awsConfig);
const s3Client = new S3Client(awsConfig);

// ── Fetch secret from SSM ──
async function getSecret(name) {
  try {
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: true,
    });
    const response = await ssmClient.send(command);
    return response.Parameter.Value;
  } catch (err) {
    console.error(`❌ Failed to fetch SSM parameter ${name}:`, err.message);
    return null;
  }
}

// ── Upload backup to S3 ──
async function uploadToS3(key, data) {
  try {
    const command = new PutObjectCommand({
      Bucket: "foreseesnetwork-assets",
      Key: key,
      Body: data,
      ContentType: "application/json",
    });
    await s3Client.send(command);
    console.log(`✅ Uploaded to S3: ${key}`);
  } catch (err) {
    console.error(`❌ Failed to upload to S3:`, err.message);
  }
}

module.exports = { getSecret, uploadToS3, s3Client, ssmClient };
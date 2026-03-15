output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.fn_bucket.bucket
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.fn_bucket.arn
}

output "iam_user_name" {
  description = "IAM user name"
  value       = aws_iam_user.fn_user.name
}

output "iam_access_key_id" {
  description = "IAM access key ID"
  value       = aws_iam_access_key.fn_user_key.id
}

output "iam_secret_access_key" {
  description = "IAM secret access key"
  value       = aws_iam_access_key.fn_user_key.secret
  sensitive   = true
}

output "ssm_db_password_path" {
  description = "SSM parameter path for DB password"
  value       = aws_ssm_parameter.db_password.name
}

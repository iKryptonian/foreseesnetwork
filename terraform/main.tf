terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ── Provider configured for LocalStack ──
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    s3       = "http://localhost:4566"
    ec2      = "http://localhost:4566"
    rds      = "http://localhost:4566"
    iam      = "http://localhost:4566"
    ssm      = "http://localhost:4566"
  }
}

# ── S3 Bucket for app assets/backups ──
resource "aws_s3_bucket" "fn_bucket" {
  bucket = "foreseesnetwork-assets"
}

resource "aws_s3_bucket_versioning" "fn_bucket_versioning" {
  bucket = aws_s3_bucket.fn_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ── IAM User for app ──
resource "aws_iam_user" "fn_user" {
  name = "foreseesnetwork-user"
}

resource "aws_iam_access_key" "fn_user_key" {
  user = aws_iam_user.fn_user.name
}

resource "aws_iam_user_policy" "fn_user_policy" {
  name = "foreseesnetwork-policy"
  user = aws_iam_user.fn_user.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.fn_bucket.arn,
          "${aws_s3_bucket.fn_bucket.arn}/*"
        ]
      }
    ]
  })
}

# ── SSM Parameters (store app secrets) ──
resource "aws_ssm_parameter" "db_password" {
  name  = "/foreseesnetwork/db_password"
  type  = "SecureString"
  value = "postgres"
}

resource "aws_ssm_parameter" "email_user" {
  name  = "/foreseesnetwork/email_user"
  type  = "SecureString"
  value = "foreseesnetwork@gmail.com"
}

resource "aws_ssm_parameter" "email_pass" {
  name  = "/foreseesnetwork/email_pass"
  type  = "SecureString"
  value = "aoivchjwxrbwmjxv"
}

variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name"
  default     = "foreseesnetwork"
}

variable "db_password" {
  description = "PostgreSQL password"
  default     = "postgres"
  sensitive   = true
}

variable "email_user" {
  description = "Email user for nodemailer"
  default     = "foreseesnetwork@gmail.com"
  sensitive   = true
}

variable "email_pass" {
  description = "Email password for nodemailer"
  default     = "aoivchjwxrbwmjxv"
  sensitive   = true
}

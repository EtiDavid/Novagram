variable "aws_region" {
  type    = string
  default = "eu-north-1"
}

variable "project_name" {
  type    = string
  default = "novagram"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "backend_environment" {
  type = list(object({
    name  = string
    value = string
  }))
  default = [
    {
      name  = "NODE_ENV"
      value = "production"
    },
    {
      name  = "PORT"
      value = "5000"
    },

  ]
}

variable "backend_secrets" {
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default = [
    {
      name      = "MONGO_URI"
      valueFrom = "arn:aws:secretsmanager:eu-north-1:770646238400:secret:novagram/mongo-uri-K0lNAY:MONGO_URI::"
    }
  ]
}


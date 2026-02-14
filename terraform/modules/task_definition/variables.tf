variable "name" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "log_group_name" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "eu-north-1"
}

variable "image" {
  type = string
}

variable "task_cpu" {
  type = number
}

variable "task_memory" {
  type = number
}

variable "container_cpu" {
  type = number
}

variable "container_memory" {
  type = number
}

variable "container_port" {
  type = number
}

variable "secrets" {
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default = []
}

variable "environment" {
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "task_name" {
  type = string
}




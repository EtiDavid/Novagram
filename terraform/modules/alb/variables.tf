# alb/variables.tf
variable "name" {
  type = string
}

variable "security_groups" {
  type = list(string)
}

variable "subnets" {
  type = list(string)
}

variable "frontend_target_group_arn" {
  type = string
}

variable "backend_target_group_arn" {
  type = string
}
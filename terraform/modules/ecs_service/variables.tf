variable "name" {
  type = string
}

variable "task_name" {
  type = string
}

variable "cluster_id" {
  type = string
}

variable "task_definition_arn" {
  type = string
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "security_group_ids" {
  type = list(string)
}

variable "subnet_ids" {
  type = list(string)
}

variable "target_group_arn" {
  type = string
}

variable "container_port" {
  type = number
}

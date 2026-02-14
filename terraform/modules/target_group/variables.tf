variable "name" {
  type = string
}
variable "service_name" {
  type = string
}
variable "vpc_id" {
  type = string
}
variable "health_check" {
  type = string
}

variable "port" {
  type = number
}

variable "protocol" {
  type = string
}
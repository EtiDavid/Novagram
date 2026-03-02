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

variable "cookie_duration" {
  type = number
  default = 86400
}

variable "enable_stickiness" {
  type = bool
  default = false
}

variable "protocol" {
  type = string
}
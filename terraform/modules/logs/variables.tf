variable "name" {
  type = string
}

variable "services" {
  type = map(object({}))
}
variable "log_retention_days" {
  type = number
}
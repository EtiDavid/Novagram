variable "name" {
  type = string
}

variable "services" {
  type = map(object({
    policy_arns = list(string)  # managed policies to attach
  }))
}

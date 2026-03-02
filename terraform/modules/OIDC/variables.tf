
variable "url" {
  description = "OIDC provider URL"
  type        = string
}

variable "client_id_list" {
  description = "List of client IDs"
  type        = list(string)
}

variable "thumbprint_list" {
  description = "List of thumbprints"
  type        = list(string)
}



# NEW: Allow custom policies to be attached
variable "additional_policy_arns" {
  description = "Additional IAM policy ARNs to attach to the role"
  type        = list(string)
  default     = []
}

variable "ssm_parameter_prefix" {
  description = "SSM parameter path prefix for CI/CD parameters"
  type        = string
  default     = "/novagram"
}
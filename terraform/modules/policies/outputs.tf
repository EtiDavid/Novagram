output "secrets_policy_arn" {
  value = aws_iam_policy.backend_secrets_policy.arn
}



output "aws_account_id" {
  value = data.aws_caller_identity.current.account_id
}
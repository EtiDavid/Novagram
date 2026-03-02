output "state_bucket" {
  value = aws_s3_bucket.terraform_state.id
}

output "lock_table" {
  value = aws_dynamodb_table.terraform_lock.id
}

output "s3_bucket_arn" {
  value = aws_s3_bucket.terraform_state.arn
}
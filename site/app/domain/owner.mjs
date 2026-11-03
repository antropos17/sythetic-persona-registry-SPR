function validateOwnerFields(values) {
  const errors = {};
  if ('username' in values && !/^[a-z0-9._-]{3,40}$/i.test(values.username))
    errors['owner-username'] =
      'Enter 3 to 40 ASCII letters, numbers, dots, underscores or hyphens.';
  if ('recoveryInput' in values && !values.recoveryInput)
    errors['owner-recovery'] = 'Enter your recovery code.';
  if ('sessionPassword' in values && !values.sessionPassword)
    errors['owner-session-password'] = 'Enter your current password.';
  if ('currentPassword' in values && !values.currentPassword)
    errors['owner-current'] = 'Enter your current password.';
  const value = 'newPassword' in values ? values.newPassword : values.password;
  if (value !== undefined) {
    const id = values.security ? 'owner-new' : 'owner-password';
    if (!value) errors[id] = 'Enter a password.';
    else if (
      values.enforceLength &&
      (Array.from(value).length < 15 || Array.from(value).length > 128)
    )
      errors[id] = 'Password must contain 15 to 128 characters.';
  }
  return errors;
}
export { validateOwnerFields };

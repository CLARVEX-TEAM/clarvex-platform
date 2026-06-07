type MatchableUser = {
  id: string;
  employeeNumber: string;
  employeeNumberAliases: Array<{ employeeNumber: string }>;
};

export function buildUserByEmployeeNumber(users: MatchableUser[]) {
  const result = new Map<string, string>();
  for (const user of users) {
    result.set(user.employeeNumber, user.id);
    for (const alias of user.employeeNumberAliases) result.set(alias.employeeNumber, user.id);
  }
  return result;
}

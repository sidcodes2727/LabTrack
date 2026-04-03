export const getStoredSession = () => {
  const token = localStorage.getItem('labtrack_token');
  const rawUser = localStorage.getItem('labtrack_user');
  if (!token || !rawUser) return null;

  try {
    return { token, user: JSON.parse(rawUser) };
  } catch {
    return null;
  }
};

export const setStoredSession = ({ token, user }) => {
  localStorage.setItem('labtrack_token', token);
  localStorage.setItem('labtrack_user', JSON.stringify(user));
};

export const clearStoredSession = () => {
  localStorage.removeItem('labtrack_token');
  localStorage.removeItem('labtrack_user');
};

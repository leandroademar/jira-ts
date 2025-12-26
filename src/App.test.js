import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import { useAuth } from './contexts/AuthContext';

// Mock the AuthContext module
jest.mock('./contexts/AuthContext');

describe('App Component', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  test('renders loading screen when auth is loading', () => {
    useAuth.mockReturnValue({
      user: null,
      loading: true,
      signIn: jest.fn(),
    });

    render(<App />);
    const loadingText = screen.getByText(/Carregando.../i);
    expect(loadingText).toBeInTheDocument();
  });

  test('renders login screen when not authenticated', () => {
    useAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: jest.fn(),
    });

    render(<App />);
    const loginTitle = screen.getByText(/JIRA - SUPORTE - COAGRO/i);
    expect(loginTitle).toBeInTheDocument();
  });
});

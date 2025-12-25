# KU Hub Service Request Dashboard

A modern, responsive React dashboard for managing Jira service requests with a KU Hub-inspired design. This application provides an intuitive interface for viewing, creating, and managing tickets across different users.

![Dashboard Screenshot](public/assets/Screenshot_30-6-2025_175715_localhost.jpeg)

![Dashboard Crete Ticket](public/assets/tickret_create.gif)

![Dashboard Preview Details](public/assets/ticket_update.gif)

## 🌟 Features

### 📊 **Dashboard Overview**
- **Modern Card Layout**: Clean, responsive stat cards showing ticket metrics
- **Real-time Data**: Live sync with Jira API for up-to-date information
- **User Switching**: Toggle between different user views (Targeted Services & Emin Fidan)
- **Responsive Design**: Optimized for desktop and mobile devices

### 🎫 **Ticket Management**
- **Create Requests**: Intuitive form for creating new service requests
- **Ticket Details**: Expandable modal with full ticket information
- **Status Tracking**: Visual indicators for ticket priority and status
- **Comment System**: View internal and customer-facing comments separately

### 🎨 **Design & UX**
- **KU Hub Branding**: Official KU Hub logo and color scheme
- **Modern UI**: Clean, professional interface with line icons
- **Dark Header**: Sophisticated header with user context
- **Accessible**: WCAG-compliant color contrasts and navigation

### 🔐 **Security & Authentication**
- **Jira API Integration**: Secure connection to Atlassian Jira Cloud
- **Environment Variables**: Secure credential management
- **CORS Support**: Proper cross-origin request handling

## 🛠️ Technology Stack

### Frontend
- **React 18.2.0**: Modern React with hooks and functional components
- **Vanilla CSS**: Custom styling with modern CSS features
- **Responsive Design**: Mobile-first approach

### Backend
- **Node.js + Express**: RESTful API server
- **Jira REST API v3**: Direct integration with Atlassian services
- **CORS**: Cross-origin resource sharing support

### Development
- **Concurrently**: Run frontend and backend simultaneously
- **React Scripts**: Development server and build tools
- **Node Fetch**: HTTP client for API requests

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v14 or higher)
- **npm** (v6 or higher)
- **Jira Cloud Account** with API access
- **Git** (for cloning the repository)

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd jira-ts
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
# Jira Configuration
REACT_APP_JIRA_EMAIL=your-email@domain.com
REACT_APP_JIRA_API_TOKEN=your-jira-api-token
REACT_APP_JIRA_DOMAIN=your-domain.atlassian.net

# Supabase Configuration
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Start the Application
```bash
# Start both frontend and backend
npm run dev

# Or start them separately:
# Terminal 1: Backend server
npm run server

# Terminal 2: Frontend app
npm start
```

### 5. Access the Dashboard
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3003
- **Health Check**: http://localhost:3003/api/health

## 🔧 Configuration

### Jira API Setup

1. **Generate API Token**:
   - Go to https://id.atlassian.com/manage-profile/security/api-tokens
   - Create a new API token
   - Copy the token for your `.env` file

2. **Find Your Domain**:
   - Your Jira URL: `https://YOUR-DOMAIN.atlassian.net`
   - Use `YOUR-DOMAIN` in the configuration

3. **Verify Permissions**:
   - Ensure your account has access to create and view issues
   - Test API connection: http://localhost:3003/api/health

### User Configuration

Update user emails in the following files if needed:
- `src/components/Header.js` - User switcher dropdown
- `src/App.js` - Default selected user

## 📁 Project Structure

```
jira-ts/
├── public/
│   ├── index.html           # Main HTML file
│   └── favicon.ico          # Website icon
├── src/
│   ├── components/          # React components
│   │   ├── Dashboard.js     # Main dashboard with stats
│   │   ├── Header.js        # Top navigation bar
│   │   ├── Sidebar.js       # Left navigation panel
│   │   ├── Layout.js        # Main layout wrapper
│   │   ├── CreateIssueForm.js # Ticket creation form
│   │   ├── IssueDetails.js  # Ticket detail modal
│   │   ├── Card.js          # Reusable card component
│   │   └── Button.js        # Reusable button component
│   ├── api/
│   │   └── jira.js          # Jira API functions
│   ├── App.js               # Main application component
│   ├── index.js             # React entry point
│   └── index.css            # Global styles
├── server/
│   └── index.js             # Express API server
├── .env                     # Environment variables
├── package.json             # Dependencies and scripts
└── README.md               # This file
```

## 🎯 Available Scripts

```bash
# Development
npm run dev          # Start both frontend and backend
npm start           # Start frontend only (port 3000)
npm run server      # Start backend only (port 3003)

# Production
npm run build       # Build frontend for production
npm test           # Run test suite
npm run eject      # Eject from Create React App (irreversible)
```

## 🔌 API Endpoints

### Tickets
- `GET /api/tickets` - Get all tickets for authenticated user
- `GET /api/tickets/user/:email` - Get tickets for specific user
- `GET /api/tickets/:ticketKey` - Get detailed ticket information
- `POST /api/issues` - Create new ticket

### Projects & Issue Types
- `GET /api/projects` - Get available projects
- `GET /api/projects/:projectId/issuetypes` - Get issue types for project

### User & Health
- `GET /api/user` - Get current user information
- `GET /api/health` - Server health check

## 🎨 Customization

### Colors & Branding
Main colors used in the application:
- **Primary Purple**: `#765ea9` (Create buttons)
- **Blue**: `#3b82f6` (Open tickets)
- **Orange**: `#f59e0b` (In Progress)
- **Green**: `#10b981` (Closed tickets)
- **Gray**: `#6b7280` (Neutral elements)

### Logo
Replace the logo by updating the `src` attribute in `src/components/Sidebar.js`:
```javascript
<img 
  src="https://your-logo-url.com/logo.png"
  alt="Your Company"
  className="logo-image"
/>
```

## 🐛 Troubleshooting

### Common Issues

**1. "Address already in use" Error**
```bash
# Kill processes on ports 3000 and 3003
lsof -ti:3000 | xargs kill -9
lsof -ti:3003 | xargs kill -9
```

**2. Jira API Authentication Failed**
- Verify your email and API token in `.env`
- Check if your Jira domain is correct
- Ensure API token has proper permissions

**3. Tickets Not Loading**
- Check browser network tab for API errors
- Verify Jira permissions for the authenticated user
- Test API health: http://localhost:3003/api/health

**4. User Switching Not Working**
- Ensure both users exist in your Jira instance
- Check if user emails are correct in the code
- Verify users have created tickets in Jira

### Debug Mode
Add this to your `.env` for verbose logging:
```env
NODE_ENV=development
DEBUG=true
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Support

For support and questions:
- **Email**: contact@targeted.services
- **Jira Issues**: Create an issue in your Jira project
- **Documentation**: Refer to [Jira REST API Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)

## 🏆 Acknowledgments

- **KU Hub** for design inspiration and branding
- **Atlassian** for Jira API
- **React Team** for the amazing framework
- **Contributors** to this project

---

**Version**: 0.1.0  
**Last Updated**: June 2025  
**Maintained by**: N/A

![Dashboard Screenrecord](public/assets/Screen_Recording.mov)
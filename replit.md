# StackMate Go - Poker Tournament Timer

## Overview

StackMate Go is a comprehensive full-stack poker tournament management application designed for running professional poker tournaments with real-time timer management, player tracking, seating arrangements, and league integration. The application supports both standalone tournaments and seasonal league play with advanced features like live spectator views, QR code integration, and customizable branding.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **UI Library**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with custom design tokens and dark theme
- **State Management**: Custom React hooks with localStorage persistence
- **Routing**: Wouter for lightweight client-side routing
- **Data Fetching**: TanStack Query (React Query) for server state management
- **Real-time Updates**: WebSocket connections for live tournament data

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **Authentication**: Replit Auth with OpenID Connect integration
- **Session Management**: Express sessions with memory store (development) and PostgreSQL store (production)
- **Real-time Communication**: WebSocket server for live tournament updates
- **API**: RESTful endpoints with validation and error handling

### Database Strategy
- **ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL via NeonDB serverless connection
- **Schema**: Relational design with tournaments, players, blind levels, and user management
- **Storage Fallback**: In-memory storage implementation for development/testing

## Key Components

### Tournament Management System
- **Timer Engine**: Precision tournament timer with customizable blind levels and break periods
- **Player Management**: Add/remove players, track knockouts, manage rebuys/add-ons
- **Seating System**: Automated table assignments with drag-and-drop interface
- **Blind Structure**: Configurable blind levels with ante support and duration customization

### Real-time Features
- **Live Updates**: WebSocket-based real-time synchronization across all connected clients
- **Spectator Mode**: Read-only tournament view for participants and spectators
- **Multi-device Support**: Synchronized tournament state across director and participant devices

### League Management
- **Season System**: Multi-season league with player tracking and point calculations
- **Tournament History**: Complete tournament records with player performance analytics
- **Standings**: Real-time league standings with configurable point systems

### User Interface
- **Responsive Design**: Mobile-first approach with touch-friendly controls
- **Accessibility**: ARIA compliance and keyboard navigation support
- **Theming**: Dark theme with customizable branding and color schemes
- **Progressive Enhancement**: Graceful degradation for offline use

## Data Flow

### Tournament Lifecycle
1. **Setup Phase**: Configure tournament settings, blind structure, and player registration
2. **Active Phase**: Real-time timer management with automatic level progression
3. **Player Management**: Track eliminations, rebuys, and table assignments
4. **Completion**: Final rankings with prize distribution and league integration

### Authentication Flow
1. **Replit Auth**: Secure authentication via OpenID Connect
2. **Session Management**: Persistent sessions with role-based access control
3. **Tournament Access**: Code-based joining system for participants and directors
4. **Anonymous Support**: Guest access for quick tournament participation

### Real-time Synchronization
1. **WebSocket Connection**: Established on tournament join/access
2. **State Broadcasting**: Tournament updates pushed to all connected clients
3. **Conflict Resolution**: Server-side state management with client reconciliation
4. **Connection Recovery**: Automatic reconnection with state synchronization

## External Dependencies

### Core Framework Dependencies
- **React Ecosystem**: React 18, React DOM, React Query for state management
- **UI Components**: Radix UI primitives, shadcn/ui component library
- **Styling**: Tailwind CSS, class-variance-authority for component variants
- **TypeScript**: Full type safety across frontend and backend

### Backend Dependencies
- **Server Framework**: Express.js with TypeScript support
- **Database**: Drizzle ORM, NeonDB serverless PostgreSQL, connection pooling
- **Authentication**: Passport.js, OpenID Client for Replit Auth integration
- **Real-time**: WebSocket (ws) library for live updates
- **Session Storage**: connect-pg-simple for PostgreSQL session store

### Development Tools
- **Build System**: Vite for frontend bundling, esbuild for backend compilation
- **Development Server**: Vite dev server with hot module replacement
- **Code Quality**: TypeScript compiler, ESLint configuration
- **Testing**: Built-in validation with Zod schema validation

### External Services
- **Database Hosting**: NeonDB serverless PostgreSQL
- **Authentication Provider**: Replit Auth service
- **File Storage**: Base64 encoding for logo/image storage
- **QR Code Generation**: Client-side QR code generation for tournament access

## Deployment Strategy

### Replit Deployment
- **Platform**: Replit autoscale deployment target
- **Build Process**: Two-stage build (frontend Vite bundle + backend esbuild)
- **Environment**: Node.js 20 runtime with PostgreSQL 16 module
- **Port Configuration**: Internal port 5000 mapped to external port 80

### Production Configuration
- **Environment Variables**: Database URL, session secrets, authentication keys
- **Process Management**: Single process with clustered WebSocket handling
- **Static Assets**: Vite-bundled frontend served from Express static middleware
- **Session Persistence**: PostgreSQL-backed session storage for production scaling

### Development Workflow
- **Hot Reloading**: Vite HMR for frontend, tsx for backend development
- **Database Migrations**: Drizzle Kit for schema management and migrations
- **Local Development**: Memory-based storage fallback for rapid iteration

## Changelog

```
Changelog:
- June 23, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```
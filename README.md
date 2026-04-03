<div align="center">
  <br />
  <h1>🎯 MeetingInsight</h1>
  <h3>AI-Powered Meeting Transcription & Business Intelligence Platform</h3>
  <p>Transform your meetings into actionable insights with real-time transcription, speaker diarization, and intelligent Q&A</p>
  
  <div>
    <img src="https://img.shields.io/badge/-TypeScript-black?style=for-the-badge&logoColor=white&logo=typescript&color=3178C6" alt="typescript" />
    <img src="https://img.shields.io/badge/-Next.js-black?style=for-the-badge&logoColor=white&logo=nextdotjs&color=000000" alt="nextdotjs" />
    <img src="https://img.shields.io/badge/-Tailwind_CSS-black?style=for-the-badge&logoColor=white&logo=tailwindcss&color=06B6D4" alt="tailwindcss" />
    <img src="https://img.shields.io/badge/-Deepgram-black?style=for-the-badge&logoColor=white&logo=deepgram&color=0C64F5" alt="deepgram" />
  </div>
</div>

## 📋 Table of Contents

1. [Introduction](#introduction)
2. [Key Features](#key-features)
3. [Tech Stack](#tech-stack)
4. [Getting Started](#getting-started)
5. [Environment Variables](#environment-variables)
6. [Project Structure](#project-structure)
7. [Features in Detail](#features-in-detail)
8. [Contributing](#contributing)
9. [License](#license)

## 🚀 Introduction

**MeetingInsight** is a comprehensive meeting intelligence platform that goes beyond simple video conferencing. It provides real-time AI-powered transcription, speaker identification, business insights extraction, and an intelligent Q&A system to help teams extract maximum value from their meetings.

### What Makes It Different?

- **🎤 Real-time Multi-Speaker Transcription**: Captures audio from all participants (local + remote) with accurate speaker diarization
- **🧠 Business Intelligence**: Automatically extracts problems, pain points, expectations, decisions, and action items
- **💬 Intelligent Q&A**: Ask questions mid-meeting about what's been discussed using AI-powered responses
- **📊 Comprehensive Analytics**: Get detailed insights on meeting engagement, sentiment, topics, and more
- **📝 Professional Transcripts**: Generate beautifully formatted transcripts with business insights

## ✨ Key Features

### 🎯 Core Capabilities

- **Real-time Transcription**: Live transcription with Deepgram's advanced speech recognition
- **Speaker Diarization**: Automatically identifies and labels different speakers
- **Multi-Audio Capture**: Captures audio from local microphone + remote participants
- **Business Insights Extraction**:
  - Problems & Issues identified
  - Pain Points & Frustrations
  - Expectations & Needs expressed
  - Productivity Blockers
  - Decisions Made
  - Action Items with assignments
- **Intelligent Q&A Chatbot**: Ask questions about the meeting in real-time
- **Meeting Analytics**:
  - Engagement metrics
  - Sentiment analysis
  - Topic classification
  - Speaking rate analysis
  - Question tracking
- **Professional Transcript Export**: Generate comprehensive meeting reports

### 🎥 Video Conferencing Features

- Secure authentication with Clerk
- Create and join meetings
- Schedule future meetings
- View past meetings and recordings
- Personal meeting rooms
- Screen sharing
- Meeting controls (mute, video, etc.)

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Beautiful UI components

### Backend & Services
- **Clerk** - Authentication & user management
- **Stream.io** - Video conferencing infrastructure
- **Deepgram** - Real-time speech-to-text with diarization
- **Google Gemini AI** - Intelligent Q&A responses (optional)
- **MongoDB** - Database for meeting data

### Key Libraries
- `@stream-io/video-react-sdk` - Video SDK
- `@google/generative-ai` - Gemini AI integration
- `@clerk/nextjs` - Authentication

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/en) (v18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/prince41773/MeetingInsight.git
cd MeetingInsight
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables** (see [Environment Variables](#environment-variables))

4. **Run the development server**

```bash
npm run dev
```

5. **Open your browser**

Navigate to [http://localhost:3000](http://localhost:3000)

## 🔐 Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Stream.io Video
NEXT_PUBLIC_STREAM_API_KEY=your_stream_api_key
STREAM_SECRET_KEY=your_stream_secret_key

# Deepgram Transcription
NEXT_PUBLIC_DEEPGRAM_API_KEY=your_deepgram_api_key

# Google Gemini AI (Optional - for enhanced Q&A)
GEMINI_API_KEY=your_gemini_api_key
# OR
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# MongoDB (Optional - for storing meeting data)
MONGODB_URI=your_mongodb_connection_string

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Getting API Keys

- **Clerk**: Sign up at [clerk.com](https://clerk.com/)
- **Stream.io**: Get your keys from [getstream.io](https://getstream.io/)
- **Deepgram**: Sign up at [deepgram.com](https://deepgram.com/) (Free tier: 200 hours/month)
- **Gemini AI**: Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey) (Optional)

## 📁 Project Structure

```
MeetingInsight/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Authentication pages
│   ├── (root)/                   # Main application pages
│   │   ├── meeting/[id]/         # Meeting room page
│   │   ├── upcoming/             # Upcoming meetings
│   │   ├── previous/             # Past meetings
│   │   └── recordings/           # Meeting recordings
│   └── api/                      # API routes
│       ├── deepgram-token/       # Deepgram API key endpoint
│       └── meeting-qa/           # Q&A chatbot endpoint
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components
│   ├── MeetingRoom.tsx           # Main meeting room component
│   ├── TranscriptionPanel.tsx   # Transcription UI
│   └── QnAChatbot.tsx           # Q&A chatbot component
├── hooks/                        # Custom React hooks
│   ├── useDeepgramTranscription.ts  # Transcription hook
│   └── useAssemblyAITranscription.ts # Alternative transcription
├── lib/                          # Utility libraries
│   ├── localTranscriptStorageClient.ts  # Transcript management
│   ├── deepgram-transcription.ts       # Deepgram service
│   └── utils.ts                 # Helper functions
└── public/                       # Static assets
```

## 🎯 Features in Detail

### Real-time Transcription

- **Multi-speaker Support**: Automatically identifies and labels different speakers
- **Mixed Audio Capture**: Captures audio from local microphone + remote participants
- **Live Updates**: See transcriptions appear in real-time
- **Speaker Attribution**: Know exactly who said what

### Business Intelligence

The platform automatically extracts:

- **Problems & Issues**: Identifies challenges and concerns mentioned
- **Pain Points**: Detects frustrations and inefficiencies
- **Expectations**: Captures needs and wants expressed
- **Productivity Blockers**: Finds bottlenecks and delays
- **Decisions**: Tracks explicit decisions made
- **Action Items**: Extracts tasks with automatic assignment detection

### Intelligent Q&A

- **Mid-meeting Questions**: Ask about what's been discussed anytime
- **Context-aware Answers**: AI-powered responses based on transcript
- **Natural Language**: Ask questions in conversational way
- **Fallback System**: Works even without Gemini API

### Transcript Export

Generate comprehensive meeting reports including:

- Clean transcript with timestamps
- Speaker-by-speaker analysis
- Business insights summary
- Questions asked
- Action items
- Key takeaways

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**Prince Raiyani**

- GitHub: [@prince41773](https://github.com/prince41773)
- Portfolio: [prince41773.github.io/Portfolio/](https://prince41773.github.io/Portfolio/)
- LinkedIn: [prince-raiyani](https://www.linkedin.com/in/prince-raiyani-695a36250)

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Video infrastructure by [Stream.io](https://getstream.io/)
- Speech recognition by [Deepgram](https://deepgram.com/)
- AI capabilities by [Google Gemini](https://deepmind.google/technologies/gemini/)

---

<div align="center">
  <p>Made with ❤️ by Prince Raiyani</p>
  <p>⭐ Star this repo if you find it helpful!</p>
</div>

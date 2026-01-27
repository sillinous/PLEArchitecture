# Contributing to CEAS

Thank you for your interest in contributing to the Community Enterprise Architecture System! This document provides guidelines for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and inclusive environment. We expect all contributors to:

- Be respectful and inclusive
- Focus on constructive feedback
- Accept responsibility for mistakes and learn from them
- Prioritize community benefit over personal interests

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/ceas.git
   cd ceas
   ```
3. **Set up the development environment** (see below)
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## How to Contribute

### Reporting Issues

- Check existing issues to avoid duplicates
- Use the issue templates when available
- Include clear, descriptive titles
- Provide steps to reproduce bugs
- Include relevant screenshots or code snippets

### Suggesting Enhancements

- Open an issue describing the enhancement
- Explain why this enhancement would be useful
- Consider how it might affect existing users
- Be open to feedback and iteration

### Contributing Code

- Start with issues labeled `good first issue` or `help wanted`
- Comment on the issue to indicate you're working on it
- Follow the pull request process below

### Contributing Documentation

- Fix typos, clarify language, add examples
- Keep documentation in sync with code changes
- Use clear, accessible language

### Contributing Data Schemas

- Propose changes to YAML data schemas
- Consider backward compatibility
- Include migration guidance for breaking changes

## Development Setup

### Prerequisites

- Ruby 3.0+ 
- Bundler
- Git

### Installation

```bash
# Install dependencies
bundle install

# Run local development server
bundle exec jekyll serve

# Visit http://localhost:4000
```

### Project Structure

```
ceas/
├── _config.yml           # Jekyll configuration
├── _data/                # YAML data files (architecture content)
│   ├── community.yml     # Core community identity
│   ├── motivation/       # BMM elements
│   ├── stakeholders.yml  # Stakeholder definitions
│   └── impact/           # Impact metrics
├── _includes/            # Reusable HTML components
├── _layouts/             # Page templates
├── assets/               # Static assets (CSS, JS, images)
├── pages/                # Main site pages
└── docs/                 # Documentation
```

## Pull Request Process

1. **Update documentation** if you change functionality
2. **Test locally** to ensure everything works
3. **Write clear commit messages** following conventional commits:
   ```
   feat: add capability heatmap visualization
   fix: correct progress bar animation
   docs: update data schema reference
   ```
4. **Open a pull request** with:
   - Clear description of changes
   - Reference to related issues
   - Screenshots for UI changes
5. **Respond to feedback** and make requested changes
6. **Squash commits** if requested before merge

## Style Guidelines

### YAML Data Files

```yaml
# Use consistent indentation (2 spaces)
# Include comments for complex structures
# Use snake_case for keys
# Validate against schema when available

goals:
  - id: goal-econ-1          # Prefix IDs with type
    name: "Economic Growth"  # Use quotes for strings
    category: economic       # Use predefined categories
    priority: high           # Use predefined values
```

### CSS

- Use CSS custom properties for theming
- Follow BEM-like naming conventions
- Mobile-first responsive design
- Prefer CSS Grid and Flexbox

### JavaScript

- Use ES6+ features
- Keep functions small and focused
- Add JSDoc comments for public functions
- Avoid global namespace pollution

### HTML/Liquid Templates

- Use semantic HTML5 elements
- Include proper accessibility attributes
- Keep templates DRY with includes
- Comment complex Liquid logic

## Questions?

- Open a discussion in GitHub Discussions
- Check existing documentation
- Reach out to maintainers

---

Thank you for contributing to CEAS! Your efforts help communities around the world articulate and share their strategic architecture.

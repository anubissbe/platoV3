# System Commands for Linux Development Environment

## Standard Linux Commands

```bash
# File operations
ls -la                            # List files with details and permissions
find . -name "*.ts" -type f       # Find TypeScript files recursively
grep -r "pattern" src/            # Search for pattern in source directory
grep -n "function" file.ts        # Search with line numbers
cat filename.txt                  # Display file contents
head -20 filename.txt             # Show first 20 lines
tail -20 filename.txt             # Show last 20 lines
less filename.txt                 # View file with pagination
wc -l *.ts                        # Count lines in TypeScript files

# Directory navigation
cd /path/to/directory             # Change directory
pwd                               # Print working directory
mkdir -p path/to/dir              # Create directory structure
rmdir empty_directory             # Remove empty directory
rm -rf directory                  # Remove directory and contents (careful!)

# File permissions and ownership
chmod +x script.sh                # Make file executable
chmod 644 file.txt                # Set read/write for owner, read for others
chown user:group file.txt         # Change ownership
stat filename.txt                 # Show detailed file information

# Process management
ps aux | grep node                # Find Node.js processes
killall node                      # Kill all Node.js processes
nohup command &                   # Run command in background
jobs                              # Show background jobs
fg %1                             # Bring job to foreground

# System information
df -h                             # Disk space usage
free -h                           # Memory usage
top                               # System processes (real-time)
htop                              # Enhanced process viewer (if installed)
uname -a                          # System information
```

## Git Commands

```bash
# Repository status
git status                        # Check working tree status
git log --oneline -10             # Show last 10 commits
git diff                          # Show unstaged changes
git diff --cached                 # Show staged changes
git branch -a                     # Show all branches

# Working with changes
git add .                         # Stage all changes
git add -p                        # Stage changes interactively
git reset HEAD file.txt           # Unstage specific file
git checkout -- file.txt         # Discard changes in file
git stash                         # Stash current changes
git stash pop                     # Apply stashed changes

# Branch management
git checkout -b feature/branch    # Create and switch to new branch
git checkout main                 # Switch to main branch
git merge feature/branch          # Merge feature branch
git branch -d feature/branch      # Delete merged branch
```

## Development-Specific Commands

```bash
# Node.js and npm
node --version                    # Check Node.js version
npm --version                     # Check npm version
npm list                          # Show installed packages
npm outdated                      # Check for outdated packages
npm audit                         # Check for security vulnerabilities
npx command                       # Run package without installing

# TypeScript
tsc --version                     # Check TypeScript version
tsc --noEmit                      # Type check without compilation
tsx file.ts                       # Run TypeScript file directly

# Package management
npm ci                            # Clean install from package-lock.json
npm install package-name          # Install new package
npm uninstall package-name        # Remove package
npm run script-name               # Run npm script
```

## Text Processing and Analysis

```bash
# Text analysis
sort file.txt                     # Sort lines alphabetically
uniq file.txt                     # Remove duplicate lines
cut -d',' -f1 file.csv           # Extract first column from CSV
awk '{print $1}' file.txt        # Print first field of each line
sed 's/old/new/g' file.txt       # Replace text in file

# File comparison
diff file1.txt file2.txt         # Show differences between files
cmp file1.txt file2.txt          # Compare files byte by byte
```

## Network and Debugging

```bash
# Network
curl -I http://example.com        # Check HTTP headers
wget http://example.com/file      # Download file
ping google.com                   # Test network connectivity
netstat -tlnp                     # Show listening ports

# System monitoring
lsof -i :3000                     # Show what's using port 3000
du -sh directory                  # Show directory size
iostat                            # I/O statistics
```

## Development Workflow Commands

```bash
# Common development patterns
find . -name "*.ts" -exec grep -l "TODO" {} \;  # Find files with TODO comments
grep -r "console.log" src/ --include="*.ts"     # Find debug statements
find . -name "node_modules" -prune -o -name "*.ts" -print | wc -l  # Count TypeScript files (excluding node_modules)
```

## Environment Variables

```bash
export NODE_ENV=development       # Set environment variable
echo $NODE_ENV                    # Display environment variable
env | grep NODE                   # Show Node-related environment variables
```

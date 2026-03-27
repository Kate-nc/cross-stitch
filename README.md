# Cross Stitch Pattern Generator

A feature-rich, single-file web application for creating, managing, and tracking cross-stitch patterns directly from your browser.

Convert your favorite images into complete cross-stitch projects with an interactive stitch tracker, pattern editor, thread organizer, and PDF export capabilities.

## Features

- **Image Conversion**: Upload any image (JPG, PNG) and automatically generate a cross-stitch pattern.
- **Customizable Patterns**: Adjust dimensions, max skein count, brightness, contrast, and saturation to get the perfect pattern.
- **Pattern Editor Tools**: Fine-tune your generated pattern using backstitch, paint, and fill tools.
- **Interactive Stitch Tracking**: Track your progress cell by cell. Easily pan, highlight specific colors, and mark completed stitches to see your completion percentage grow.
- **Thread Organizer**: Manage your DMC floss inventory. Track what you own and generate a shopping list for what you need to buy, complete with estimated costs.
- **Export & Print**: Export your complete pattern as a multi-page PDF or an A4 image chart. You can also generate a project cover sheet summarizing your fabric count, estimated time, thread list, and more.
- **Session Tracking**: Built-in timer to record your stitching sessions, giving you an estimated time to completion based on your actual stitching speed.
- **Local Storage**: Save your progress, edits, and thread inventory locally as a `.json` project file to pick up right where you left off.

## Technologies Used

- React (via CDN)
- Babel (for in-browser JSX compilation)
- jsPDF (for PDF generation)

## Usage

Since this is a client-side application contained entirely within a single HTML file, there is no installation or build step required.

1. Clone or download this repository.
2. Open `index.html` in your preferred modern web browser.
3. Click to upload an image and start generating your pattern!

## Project Save & Load

You can save your entire project—including your generated pattern, your stitching progress, parking markers, and thread organizer state—by clicking **Save (.json)** in the Export tab.

To resume a previous project, simply click **Open** at the top of the app and select your saved `.json` file.

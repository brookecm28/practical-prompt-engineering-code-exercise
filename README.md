## Practical Prompt Engineering Course
This is a companion repository for the [Practical Prompt Engineering](https://frontendmasters.com/courses/prompt-engineering/) course on Frontend Masters.
[![Frontend Masters](https://static.frontendmasters.com/assets/brand/logos/full.png)](https://frontendmasters.com/courses/prompt-engineering/)

### About this Repo

This repo contains the final code for the **Prompt Library** application build in the course. The `reference-project` branch is the application demonstrated at the beginning of the course. The commits on the `main` branch are the progress checks while for the application build during the course.

### Also See
[Sabrina Goldfarb's Course](https://sgoldfarb2.github.io/practical-prompt-engineering/) which includes notes and prompts for easy copying.

### Import / Export

- Use the `Export Prompts` button in the header to download a JSON snapshot of all prompts and metadata.
- Use the `Import Prompts` button to load a previously exported JSON file. The importer will:
	- Validate the file structure and timestamp.
	- Prompt if duplicate prompt IDs are detected and ask whether to `merge` (append/keep existing) or `replace` (overwrite existing entries).
	- Automatically back up your current prompts before applying the import and will roll back on error.
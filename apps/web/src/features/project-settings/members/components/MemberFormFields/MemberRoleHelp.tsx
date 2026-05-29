import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

export function RoleHelpAccordion() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='member-role-help'>
        <AccordionTrigger>Which role should I pick?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            <strong>Business User</strong> — sees accessible Data Marts and Reports, creates Reports
            for Data Marts available for reporting, manages Reports they own (edit, delete, change
            owners), manages Report Triggers under their Reports, and uses Destinations available
            for use. Cannot create, edit, or delete Data Marts, Data Mart Triggers, or Storages.
          </p>
          <p className='mb-2'>
            <strong>Technical User</strong> — everything a Business User may do, plus: creates,
            edits, and deletes Data Marts, Data Mart Triggers, and Storages; edits and deletes
            Reports project-wide; changes Report owners; manages Report Triggers project-wide.
          </p>
          <p className='mb-2'>
            <strong>Project Admin</strong> — everything a Technical User may do, plus: manages
            Project Members, manages billing, and manages general Project settings such as the
            Project title.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function ScopeHelpAccordion() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='member-scope-help'>
        <AccordionTrigger>What do the scopes mean?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            <strong>Entire project</strong> — the member sees every shared resource in the project
            (subject to role and ownership rules).
          </p>
          <p className='mb-2'>
            <strong>Selected contexts only</strong> — the member sees resources only if they share
            at least one assigned context, or if the member is an owner. Picking this with no
            contexts below is a valid "no shared access" state.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

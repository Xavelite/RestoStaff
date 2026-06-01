/* restogogo planning module — metric cards. */
(function(){
  const P = Restogogo.planningModule;
  const PlanningLogic = Restogogo.logic.planning;
  const Metrics = Restogogo.services.metrics;

  P.renderMetrics = function renderMetrics(){
    const root=$('planningMetrics');
    if(!root)return;
    const rows=PlanningLogic.weekRows(data);
    const summary=PlanningLogic.summarizeRows(rows);
    const plannedShiftCount=rows.length;
    const coveredPeople=new Set(rows.map(r=>r.e.id)).size;
    const isPublished=data.status==='Published';
    const coverageSummary=Restogogo.logic?.coverage?.weekSummary?.(data)||{requirementCount:0,issueCount:0,missingPeople:0,extraPeople:0,status:'missing'};
    const coverageValue=!coverageSummary.requirementCount?'Setup missing':(coverageSummary.issueCount?`${coverageSummary.issueCount} issue${coverageSummary.issueCount===1?'':'s'}`:'OK');
    const coverageMeta=!coverageSummary.requirementCount?'Define expected staffing in Restaurant setup':(coverageSummary.issueCount?`${coverageSummary.missingPeople} missing · ${coverageSummary.extraPeople} extra`:'Expected coverage matches planning');
    const coverageTone=coverageSummary.status==='ok'?'success':coverageSummary.status==='missing'?'warning':'warning';
    const coverageIcon=coverageSummary.status==='ok'?'check':'alert';
    const planningEdit=P.editability();
    const statusMeta=!planningEdit.ok?planningEdit.message:(isPublished?'Visible to team':'Not published');
    const conflicts=P.conflicts(activeEmployees()).length;

    root.innerHTML=[
      Metrics.card({
        detailKey:'planning.status',
        className:`planning-status-metric rs-metric--hero ${isPublished?'is-published':'is-draft'}`,
        tone:'status',
        icon:isPublished?'check':'document',
        label:'Schedule status',
        value:isPublished?'Published':'Draft',
        meta:statusMeta
      }),
      Metrics.card({detailKey:'planning.hours',tone:'hours',icon:'clock',label:'Planned hours',value:fmtHours(summary.hours),meta:`${plannedShiftCount} shifts · ${fmtPeople(coveredPeople)}`}),
      Metrics.card({detailKey:'planning.coverage',tone:coverageTone,icon:coverageIcon,label:'Coverage',value:coverageValue,meta:coverageMeta}),
      Metrics.card({detailKey:'planning.conflicts',tone:conflicts?'danger':'success',icon:conflicts?'alert':'check',label:'Availability conflicts',value:conflicts?String(conflicts):'Clear',meta:conflicts?'Planned outside availability':'No conflicts detected'})
    ].join('');
    Restogogo.ui?.animateCounters?.(root,280);
  };
})();

/** Planning module slice. Loaded in order by index.html. */
function renderPlanningMetrics(){
  const root=$('planningMetrics');
  if(!root)return;
  const rows=PlanningLogic.weekRows(data);
  const summary=PlanningLogic.summarizeRows(rows);
  const plannedShiftCount=rows.length;
  const coveredPeople=new Set(rows.map(r=>r.e.id)).size;
  const previousWeek=addDays(data.weekStart,-7);
  const previousRows=planningSnapshotRows(previousWeek);
  const previousCost=previousRows.reduce((sum,r)=>sum+(r.cost||0),0);
  const diff=summary.cost-previousCost;
  const diffLabel=previousRows.length?`${diff>=0?'+':''}${money(diff)} vs last week`:'Projected weekly cost';
  const isPublished=data.status==='Published';
  const publishLabel=isPublished?'Unpublish schedule':'Publish schedule';
  const coverageSummary=Restogogo.logic?.coverage?.weekSummary?.(data) || {requirementCount:0,issueCount:0,missingPeople:0,extraPeople:0,status:'missing'};
  const coverageValue=!coverageSummary.requirementCount?'Setup missing':(coverageSummary.issueCount?`${coverageSummary.issueCount} issue${coverageSummary.issueCount===1?'':'s'}`:'OK');
  const coverageMeta=!coverageSummary.requirementCount?'Define expected staffing in Restaurant setup':(coverageSummary.issueCount?`${coverageSummary.missingPeople} missing · ${coverageSummary.extraPeople} extra`:'Expected coverage matches planning');
  const coverageTone=coverageSummary.status==='ok'?'success':coverageSummary.status==='missing'?'warning':'warning';
  const coverageIcon=coverageSummary.status==='ok'?'check':'alert';

  root.innerHTML=[
    Metrics.card({
      tag:'button',
      id:'planningPublishMetricBtn',
      className:`planning-publish-metric ${isPublished?'is-published':'is-draft'}`,
      tone:'status',
      icon:isPublished?'check':'document',
      label:'Schedule status',
      value:isPublished?'Published':'Draft',
      meta:isPublished?'Click to unpublish':'Click to publish',
      ariaLabel:publishLabel,
      attrs:{type:'button',title:publishLabel}
    }),
    Metrics.week({
      id:'planningWeekMetric',
      ariaLabel:'Change planning week',
      prevId:'prevWeek',
      nextId:'nextWeek',
      inputId:'weekStart',
      inputAriaLabel:'Select planning week',
      valueId:'planningWeekLabel',
      metaId:'planningWeekMeta',
      value:weekDisplayRange(),
      meta:'Click to change',
      inputValue:data.weekStart
    }),
    Metrics.card({tone:'hours',icon:'clock',label:'Planned hours',value:fmtHours(summary.hours),meta:`${plannedShiftCount} shifts · ${fmtPeople(coveredPeople)}`}),
    Metrics.card({tone:coverageTone,icon:coverageIcon,label:'Coverage',value:coverageValue,meta:coverageMeta}),
    Metrics.card({tone:'cost',icon:'euro',label:'Cost impact',value:money(summary.cost),meta:diffLabel})
  ].join('');
}
